import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

export default function VhsSlot() {
  const [isAnimating, setIsAnimating] = useState(false);
  const [lidOpen, setLidOpen] = useState(false);
  const [cassetteVisible, setCassetteVisible] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [hideInterface, setHideInterface] = useState(false);

  const timers = useRef([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const startVideo = () => {
    const video = document.getElementById('bgVideo');
    const videoContainer = document.querySelector('.video-background');
    if (video && videoContainer) {
      video.currentTime = 0;
      video.play().catch(e => console.warn('Video play error:', e));
      videoContainer.classList.add('active');
    }
  };

  const handlePlay = () => {
    if (isAnimating) return;
    setIsAnimating(true);

    // 1. Открываем слот
    setLidOpen(true);

    // 2. Кассета въезжает через 300ms
    const startCassetteTimer = window.setTimeout(() => {
      setCassetteVisible(true);
    }, 300);
    timers.current.push(startCassetteTimer);

    const cassetteDuration = 2400;
    
    // 3. Начинаем закрывать крышку ДО окончания анимации кассеты (на 400ms раньше)
    const closeLidTimer = window.setTimeout(() => {
      setCassetteVisible(false);
      setLidOpen(false);
    }, 300 + cassetteDuration - 400);
    timers.current.push(closeLidTimer);

    // 4. Белый шум + исчезновение только VHS слота (после полного закрытия крышки)
    const showNoiseTimer = window.setTimeout(() => {
      setShowNoise(true);
      
      // 5. Убираем шум через 1.5 сек, скрываем интерфейс, запускаем видео
      const hideAllTimer = window.setTimeout(() => {
        setShowNoise(false);
        setHideInterface(true);
        startVideo();
        
        const finishTimer = window.setTimeout(() => {
          setIsAnimating(false);
        }, 500);
        timers.current.push(finishTimer);
      }, 1500);
      timers.current.push(hideAllTimer);
    }, 300 + cassetteDuration - 400 + 900); // начало закрытия (-400) + время закрытия (900)
    timers.current.push(showNoiseTimer);
  };

  const lidVariants = {
    closed: { rotateX: 0, top: 0, height: '50px' },
    openToward: { rotateX: 70 },
  };

  const cassetteVariants = {
    hiddenInstant: { opacity: 0, z: 0, y: 0, scale: 1 },
    entering: {
      opacity: 1,
      z: [0, -150, -150],
      y: [0, 0, 25],
      scale: [1, 0.92, 0.86],
      transition: { duration: 2.4, ease: [0.22, 1, 0.36, 1], times: [0, 0.72, 1] },
    },
  };

  if (hideInterface) {
    return null;
  }

  return (
    <>
      {/* VHS White Noise Overlay - Пиксельная рябь */}
      {showNoise && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          {/* SVG фильтр для создания настоящего пиксельного шума */}
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <filter id="vhsNoise">
              <feTurbulence 
                type="fractalNoise" 
                baseFrequency="0.9" 
                numOctaves="4" 
                stitchTiles="stitch"
              >
                <animate 
                  attributeName="baseFrequency" 
                  dur="0.1s" 
                  values="0.9;0.95;0.85;0.92;0.88;0.9" 
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feColorMatrix type="saturate" values="0"/>
              <feComponentTransfer>
                <feFuncR type="linear" slope="1.5" intercept="-0.2"/>
                <feFuncG type="linear" slope="1.5" intercept="-0.2"/>
                <feFuncB type="linear" slope="1.5" intercept="-0.2"/>
              </feComponentTransfer>
            </filter>
          </svg>
          
          {/* Слой шума */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#888',
            filter: 'url(#vhsNoise) contrast(1.5) brightness(1.1)',
            opacity: 0.92,
            animation: 'vhsShake 0.15s infinite steps(2)'
          }} />
          
          {/* Дополнительный слой для усиления */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent 0px, rgba(255,255,255,0.03) 2px, transparent 4px)',
            animation: 'vhsScan 0.08s infinite linear',
            mixBlendMode: 'overlay'
          }} />
          
          <style>{`
            @keyframes vhsShake {
              0% { 
                transform: translate(0, 0); 
                opacity: 0.92;
              }
              50% { 
                transform: translate(-1px, 1px); 
                opacity: 0.88;
              }
              100% { 
                transform: translate(1px, -1px); 
                opacity: 0.9;
              }
            }
            
            @keyframes vhsScan {
              0% { transform: translateY(0); }
              100% { transform: translateY(4px); }
            }
          `}</style>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: '420px',
            height: '100px',
            background: 'linear-gradient(180deg, #2a2419 0%, #1a1410 100%)',
            border: '3px solid #3d3528',
            borderRadius: '6px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            perspective: '800px',
            overflow: 'hidden',
            opacity: showNoise ? 0 : 1,
            transition: 'opacity 1.5s ease-out'
          }}
        >
        {/* VHS noise overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 2px)',
          pointerEvents: 'none',
          opacity: 0.4,
          mixBlendMode: 'overlay'
        }} />
        
        {/* Left section with slot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
          <div
            style={{
              position: 'relative',
              width: '240px',
              height: '50px',
              background: '#0a0a08',
              border: '2px solid #2a2419',
              borderRadius: '4px',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              overflow: 'hidden',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Lid fully flush */}
             <motion.div
               style={{
                 position: 'absolute',
                 left: 0,
                 right: 0,
                 background: 'linear-gradient(180deg, #3a342a 0%, #2a251d 100%)',
                 borderBottom: '1px solid #4a4032',
                 borderRadius: '2px 2px 0 0',
                 boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                 transformOrigin: 'top center'
               }}
               variants={lidVariants}
               animate={lidOpen ? "openToward" : "closed"}
               transition={!lidOpen ? { duration: 0.9, ease: "easeInOut" } : { duration: 0.45, ease: "easeInOut" }}
             />

            {/* Cassette visible only during insertion */}
            {cassetteVisible && (
              <motion.div
                style={{
                  position: 'absolute',
                  top: '6px',
                  left: '24px',
                  width: '192px',
                  height: '38px',
                  borderRadius: '2px',
                  border: '1px solid #000',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  fontWeight: '700',
                  color: '#8a8a7a',
                  background: 'linear-gradient(90deg, #3a3530, #2a2420)',
                  transformStyle: 'preserve-3d',
                  letterSpacing: '0.12em'
                }}
                variants={cassetteVariants}
                initial="hiddenInstant"
                animate="entering"
              >
                INMISE ARCHIVE
              </motion.div>
            )}
          </div>

          <div style={{
            fontSize: '9px',
            color: '#6a5d4a',
            letterSpacing: '0.12em',
            fontFamily: 'monospace',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            VHS
          </div>
        </div>

        {/* Right section with button and indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Indicator LED */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              boxShadow: cassetteVisible 
                ? '0 0 8px #4ade80, 0 0 12px rgba(74, 222, 128, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.3)' 
                : '0 0 6px #8b0000, inset 0 1px 2px rgba(0, 0, 0, 0.5)',
              background: cassetteVisible 
                ? 'radial-gradient(circle at 30% 30%, #6eff8f, #4ade80)' 
                : 'radial-gradient(circle at 30% 30%, #aa0000, #6b0000)',
              transition: 'all 0.3s',
              border: '1px solid rgba(0, 0, 0, 0.3)'
            }}
          />

          {/* Push button PLAY */}
          <button
            onClick={handlePlay}
            disabled={isAnimating}
            style={{
              position: 'relative',
              width: '50px',
              height: '50px',
              background: isAnimating 
                ? 'linear-gradient(135deg, #3a3530 0%, #2a2420 100%)' 
                : 'linear-gradient(135deg, #8b0000 0%, #650000 100%)',
              border: '2px solid #1a1410',
              borderRadius: '4px',
              boxShadow: isAnimating
                ? 'inset 0 3px 6px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.3)'
                : '0 4px 0 #450000, 0 5px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              cursor: isAnimating ? 'not-allowed' : 'pointer',
              transition: 'all 0.1s',
              transform: isAnimating ? 'translateY(4px)' : 'translateY(0)',
              color: isAnimating ? '#6a5d4a' : '#ffdddd',
              fontSize: '16px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
            }}
            onMouseDown={(e) => {
              if (!isAnimating) {
                e.currentTarget.style.transform = 'translateY(3px)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.3)';
              }
            }}
            onMouseUp={(e) => {
              if (!isAnimating) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #450000, 0 5px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isAnimating) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #450000, 0 5px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
              }
            }}
            aria-pressed={lidOpen}
            aria-label="Play cassette"
          >
            ▶
          </button>
        </div>

        {/* Bottom label */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '20px',
          fontSize: '7px',
          color: '#5a4d3a',
          letterSpacing: '0.2em',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)'
        }}>
          VHS DECK SYSTEM
        </div>

        {/* Vintage scanlines */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(0,0,0,0.1) 1px, rgba(0,0,0,0.1) 2px)',
          pointerEvents: 'none',
          mixBlendMode: 'multiply'
        }} />
      </div>
    </div>
    </>
  );
}

