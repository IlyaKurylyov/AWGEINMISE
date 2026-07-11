import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Плагин для копирования scripts и .htaccess
function copyScripts() {
  return {
    name: 'copy-scripts',
    closeBundle() {
      const srcDir = 'scripts'
      const destDir = 'dist/scripts'
      
      try {
        mkdirSync(destDir, { recursive: true })
        
        const files = readdirSync(srcDir)
        files.forEach(file => {
          const srcPath = join(srcDir, file)
          const destPath = join(destDir, file)
          
          if (statSync(srcPath).isFile()) {
            copyFileSync(srcPath, destPath)
            console.log(`Copied: ${file}`)
          }
        })
        
        // Копируем .htaccess
        try {
          copyFileSync('.htaccess', 'dist/.htaccess')
          console.log('Copied: .htaccess')
        } catch (err) {
          console.warn('Warning: .htaccess not found or could not be copied')
        }
      } catch (err) {
        console.error('Error copying scripts:', err)
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), copyScripts()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        artists: resolve(__dirname, 'artists.html'),
        music: resolve(__dirname, 'music.html'),
        contacts: resolve(__dirname, 'contacts.html'),
        work: resolve(__dirname, 'work.html'),
        admin: resolve(__dirname, 'admin.html'),
        vhsMain: resolve(__dirname, 'src/vhs-main.jsx'),
      },
      output: {
        // Принудительное изменение хэша при каждой сборке
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/css/i.test(ext)) {
            // Добавляем timestamp для CSS
            return `assets/[name]-[hash]-${Date.now()}[extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    },
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Гарантируем минификацию CSS
    cssMinify: true,
    // Обновляем target для лучшей совместимости
    target: 'es2015',
  },
  publicDir: 'assets',
})

