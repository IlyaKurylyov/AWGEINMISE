import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const EVENT_TITLES: Record<string, string> = {
  release_soon: "Скоро релиз",
  task_due: "Пора браться за задачу",
  task_overdue: "Задача просрочена",
  publish_failed: "Публикация не прошла",
  weekly_digest: "Сводка за неделю",
  tasks_unplanned: "Задачи без сроков",
};

const today = () => new Date().toISOString().slice(0, 10);

// Местное время артиста: рассылка не должна приходить ночью только потому,
// что почасовой cron первым делом проходит сразу после полуночи UTC.
function localParts(timezone: string) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...options }).format(new Date());
  try {
    return {
      hour: Number(format({ hour: "2-digit", hour12: false })),
      weekday: format({ weekday: "short" }),
      date: format({ year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"),
    };
  } catch {
    const now = new Date();
    return { hour: now.getUTCHours(), weekday: "Mon", date: today() };
  }
}
const dayDiff = (value: string) => {
  const a = new Date(value); a.setUTCHours(0, 0, 0, 0);
  const b = new Date(); b.setUTCHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

async function sendEmail(to: string, subject: string, lines: string[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM") || "INMISE <onboarding@resend.dev>";
  if (!apiKey) throw new Error("resend_not_configured");
  const html = `<div style="font-family:ui-monospace,monospace;font-size:15px;line-height:1.6;color:#23271f">
    <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#6f7a68;margin:0 0 10px">INMISE · секретарь</p>
    <h2 style="margin:0 0 14px;font-size:20px">${subject}</h2>
    ${lines.map((line) => `<p style="margin:0 0 8px">${line}</p>`).join("")}
    <p style="margin:22px 0 0;font-size:13px;color:#8b9487">Настроить уведомления — кабинет артиста, раздел «Секретарь».</p>
  </div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `INMISE · ${subject}`, html }),
  });
  if (!response.ok) throw new Error(`resend_failed: ${await response.text()}`);
}

async function sendTelegram(botToken: string, chatId: string, subject: string, lines: string[]) {
  const text = `*${subject}*\n\n${lines.join("\n")}`;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`telegram_failed: ${data.description || response.status}`);
}

// Собирает поводы написать артисту, опираясь на существующие данные кабинета.
// deno-lint-ignore no-explicit-any
async function collectDue(admin: any, artistId: string, rules: any[]) {
  const enabled = (type: string) => rules.filter((rule) => rule.event_type === type && rule.enabled);
  const due: Array<{ type: string; key: string; line: string }> = [];

  if (enabled("release_soon").length || enabled("task_due").length || enabled("task_overdue").length) {
    const { data: tasks } = await admin.from("project_tasks")
      .select("id, title, due_at, is_done").eq("artist_id", artistId).eq("is_done", false).not("due_at", "is", null);
    for (const task of tasks || []) {
      const left = dayDiff(task.due_at);
      if (left < 0 && enabled("task_overdue").length) {
        due.push({ type: "task_overdue", key: task.id, line: `«${task.title}» — срок прошёл ${Math.abs(left)} дн. назад.` });
      } else if (left === 0 && enabled("task_due").length) {
        due.push({ type: "task_due", key: task.id, line: `«${task.title}» — запланировано на сегодня.` });
      }
    }

    const { data: projects } = await admin.from("artist_projects")
      .select("id, title, release_at, status").eq("artist_id", artistId).eq("status", "scheduled").not("release_at", "is", null);
    for (const project of projects || []) {
      const left = dayDiff(project.release_at);
      for (const rule of enabled("release_soon")) {
        const lead = rule.timing === "1d" ? 1 : rule.timing === "0d" ? 0 : 3;
        if (left === lead) {
          due.push({ type: "release_soon", key: `${project.id}:${lead}`, line: `«${project.title || "Без названия"}» выходит ${left === 0 ? "сегодня" : `через ${left} дн.`}` });
        }
      }
    }
  }

  // Задачи без дат напоминают о себе раз в неделю, одним сообщением на все.
  if (enabled("tasks_unplanned").length) {
    const { data: unplanned } = await admin.from("project_tasks")
      .select("id").eq("artist_id", artistId).eq("is_done", false).is("due_at", null);
    const count = (unplanned || []).length;
    if (count) {
      // При «каждый день» ключ дневной, при «раз в неделю» — недельный:
      // так одна и та же запись в журнале отправок ограничивает частоту.
      const daily = enabled("tasks_unplanned").some((rule) => rule.timing === "daily");
      const now = new Date();
      const week = `${now.getUTCFullYear()}-w${Math.ceil(((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
      due.push({
        type: "tasks_unplanned",
        key: daily ? today() : week,
        line: `Без даты висит задач: ${count}. Поставьте сроки, иначе они утонут.`,
      });
    }
  }

  if (enabled("publish_failed").length) {
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const { data: fails } = await admin.from("social_post_targets")
      .select("id, platform, error_message, created_at").eq("artist_id", artistId).eq("status", "failed").gte("created_at", since);
    for (const fail of fails || []) {
      due.push({ type: "publish_failed", key: fail.id, line: `${fail.platform}: ${fail.error_message || "без деталей"}` });
    }
  }

  return due;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = String(payload.action || "");

  try {
    // Рассылка вызывается по расписанию и защищена отдельным секретом,
    // а не пользовательской сессией.
    if (action === "dispatch") {
      // Секрет живёт в public.app_secrets под RLS без политик: читаем его
      // service-role ключом, снаружи таблица недоступна.
      const { data: secretRow } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
      const secret = secretRow?.value || Deno.env.get("CRON_SECRET");
      if (!secret || request.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

      const { data: channels } = await admin.from("notification_channels").select("*").eq("verified", true);
      const { data: rules } = await admin.from("notification_rules").select("*").eq("enabled", true);
      const { data: prefs } = await admin.from("notification_prefs").select("*");
      const artistIds = Array.from(new Set((rules || []).map((rule) => rule.artist_id)));
      const report: Array<{ artist: string; sent: number; skipped: number; failed: string[] }> = [];

      for (const artistId of artistIds) {
        const artistRules = (rules || []).filter((rule) => rule.artist_id === artistId);
        const artistChannels = (channels || []).filter((channel) => channel.artist_id === artistId);
        if (!artistChannels.length) continue;

        const pref = (prefs || []).find((row) => row.artist_id === artistId);
        const sendHour = pref?.send_hour ?? 10;
        const zone = pref?.timezone || "Europe/Moscow";
        const local = localParts(zone);
        const inSendWindow = local.hour === sendHour;

        const due = await collectDue(admin, artistId, artistRules);
        let sent = 0, skipped = 0;
        const failed: string[] = [];

        for (const item of due) {
          for (const rule of artistRules.filter((r) => r.event_type === item.type)) {
            const channel = artistChannels.find((c) => c.kind === rule.channel_kind);
            if (!channel) continue;

            // Сбой публикации сообщаем сразу, остальное — в выбранный час,
            // а «раз в неделю» вдобавок только по понедельникам.
            const instant = item.type === "publish_failed" && rule.timing !== "digest";
            if (!instant) {
              if (!inSendWindow) { skipped += 1; continue; }
              if (rule.timing === "weekly" && local.weekday !== "Mon") { skipped += 1; continue; }
            }

            // «once» — напомнить один раз за всё время, иначе раз в сутки.
            const query = admin.from("notification_log").select("id")
              .eq("artist_id", artistId).eq("event_type", item.type)
              .eq("subject_key", item.key).eq("channel_kind", rule.channel_kind);
            // «Один раз» и «раз в неделю» смотрят на весь журнал: ключ у них
            // уже содержит нужный период. Остальные — только на сегодня.
            const { data: already } = (rule.timing === "once" || rule.timing === "weekly")
              ? await query.limit(1)
              : await query.eq("sent_date", today()).limit(1);
            if (already && already.length) { skipped += 1; continue; }

            try {
              if (rule.channel_kind === "email") {
                await sendEmail(channel.address, EVENT_TITLES[item.type] || item.type, [item.line]);
              } else {
                const { data: tg } = await admin.from("social_connections")
                  .select("access_token").eq("artist_id", artistId).eq("platform", "telegram").maybeSingle();
                if (!tg?.access_token || !channel.chat_id) { skipped += 1; continue; }
                await sendTelegram(tg.access_token, channel.chat_id, EVENT_TITLES[item.type] || item.type, [item.line]);
              }
              await admin.from("notification_log").insert({
                artist_id: artistId, event_type: item.type, subject_key: item.key,
                channel_kind: rule.channel_kind, sent_date: today(),
              });
              sent += 1;
            } catch (error) {
              failed.push(error instanceof Error ? error.message : String(error));
            }
          }
        }
        report.push({ artist: artistId, sent, skipped, failed });
      }
      return json({ dispatched: report });
    }

    // Остальные действия — от имени артиста.
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return json({ error: "authentication_required" }, 401);

    const { data: artist } = await admin.from("artists").select("id").eq("owner_user_id", callerData.user.id).maybeSingle();
    if (!artist) return json({ error: "artist_not_found" }, 404);

    // Ищем личный chat_id артиста: он нажал «Старт» в своём боте,
    // мы забираем последнее сообщение через getUpdates — вебхук не нужен.
    if (action === "link_telegram") {
      const { data: tg } = await admin.from("social_connections")
        .select("access_token, external_account_name").eq("artist_id", artist.id).eq("platform", "telegram").maybeSingle();
      if (!tg?.access_token) return json({ error: "telegram_bot_missing", detail: "Сначала подключите Telegram в автопостинге." }, 400);

      const response = await fetch(`https://api.telegram.org/bot${tg.access_token}/getUpdates?limit=20`);
      const data = await response.json();
      if (!data.ok) return json({ error: "telegram_failed", detail: data.description || "" }, 400);

      const personal = (data.result || [])
        .map((update: Record<string, any>) => update.message)
        .filter((message: Record<string, any>) => message?.chat?.type === "private")
        .pop();
      if (!personal) {
        return json({ error: "telegram_no_start", detail: "Не нашли ваше сообщение. Напишите боту «Старт» в личку и повторите." }, 400);
      }

      const chatId = String(personal.chat.id);
      const name = personal.chat.username ? `@${personal.chat.username}` : (personal.chat.first_name || "Telegram");
      await admin.from("notification_channels").upsert({
        artist_id: artist.id, kind: "telegram", address: name, chat_id: chatId, verified: true,
      }, { onConflict: "artist_id,kind" });
      await sendTelegram(tg.access_token, chatId, "Уведомления подключены", ["Теперь секретарь будет писать сюда."]);
      return json({ connected: true, address: name });
    }

    if (action === "save_email") {
      const address = String(payload.address || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return json({ error: "invalid_email" }, 400);
      await admin.from("notification_channels").upsert({
        artist_id: artist.id, kind: "email", address, verified: true,
      }, { onConflict: "artist_id,kind" });
      return json({ connected: true, address });
    }

    if (action === "test") {
      const kind = String(payload.kind || "");
      const { data: channel } = await admin.from("notification_channels")
        .select("*").eq("artist_id", artist.id).eq("kind", kind).maybeSingle();
      if (!channel) return json({ error: "channel_missing" }, 400);
      if (kind === "email") {
        await sendEmail(channel.address, "Проверка связи", ["Если вы читаете это письмо, уведомления работают."]);
      } else {
        const { data: tg } = await admin.from("social_connections")
          .select("access_token").eq("artist_id", artist.id).eq("platform", "telegram").maybeSingle();
        if (!tg?.access_token || !channel.chat_id) return json({ error: "channel_missing" }, 400);
        await sendTelegram(tg.access_token, channel.chat_id, "Проверка связи", ["Если вы читаете это сообщение, уведомления работают."]);
      }
      return json({ sent: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("secretary-notify", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "request_failed", detail: message }, 500);
  }
});
