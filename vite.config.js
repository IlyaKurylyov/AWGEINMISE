import { defineConfig } from 'vite'
import { resolve, join } from 'path'
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'fs'

const runtimeScripts = [
  'admin.js',
  'app.js',
  'artists-signal.js',
  'beats.js',
  'config.js',
  'config.local.js',
  'home-terminal.js',
  'releases-vhs.js',
  'work-dynamic.js',
]

function copyRuntimeFiles() {
  return {
    name: 'copy-runtime-files',
    closeBundle() {
      const destination = 'dist/scripts'
      mkdirSync(destination, { recursive: true })

      runtimeScripts.forEach((file) => {
        const source = join('scripts', file)
        if (existsSync(source)) {
          copyFileSync(source, join(destination, file))
        }
      })

      ;['beats', 'icons', 'images'].forEach((directory) => {
        const source = join('assets', directory)
        if (existsSync(source)) {
          cpSync(source, join('dist', 'assets', directory), { recursive: true })
        }
      })

      if (existsSync('.htaccess')) {
        copyFileSync('.htaccess', 'dist/.htaccess')
      }
    },
  }
}

export default defineConfig({
  plugins: [copyRuntimeFiles()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        artists: resolve(__dirname, 'artists.html'),
        music: resolve(__dirname, 'music.html'),
        contacts: resolve(__dirname, 'contacts.html'),
        work: resolve(__dirname, 'work.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    cssMinify: true,
    target: 'es2015',
  },
  publicDir: false,
})
