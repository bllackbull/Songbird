import {defineConfig} from 'vitepress';

const enSidebar = [
  {
    text: '📦 Installation & Deployment',
    collapsed: false,
    items: [
      {text: '🚀 Deployment Script', link: '/Deployment-Script'},
      {text: '🐳 Install via Docker', link: '/Installation-Docker'},
      {text: '🛠️ Manual Installation', link: '/Manual-Installation'},
      {text: '🌐 Configure Nginx', link: '/Nginx-Configuration'},
      {text: '🔒 SSL Certificates', link: '/SSL-Certificates'},
      {text: '☁️ Running behind a CDN', link: '/CDN-Setup'},
      {text: '🧭 Subpath Hosting', link: '/Subpath-Hosting'},
    ],
  },
  {
    text: '⚙️ Configuration',
    collapsed: false,
    items: [
      {text: '🔧 Environment Variables', link: '/Environment-Variables'},
      {text: '📡 Remote Channel Setup', link: '/Remote-Channel-Setup'},
      {text: '🔔 Push Notification Proxy', link: '/Push-Notification-Proxy'},
    ],
  },
  {
    text: '🔨 Operations',
    collapsed: false,
    items: [
      {text: '🔄 Updating', link: '/Updating'},
      {text: '🗃️ Database Commands', link: '/Database-Commands'},
      {text: '🩺 Troubleshooting', link: '/Troubleshooting'},
    ],
  },
];

const faSidebar = [
  {
    text: '📦 نصب و راه‌اندازی',
    collapsed: false,
    items: [
      {text: '🚀 اسکریپت نصب', link: '/fa/Deployment-Script'},
      {text: '🐳 نصب از طریق Docker', link: '/fa/Installation-Docker'},
      {text: '🛠️ نصب دستی', link: '/fa/Manual-Installation'},
      {text: '🌐 کانفیگ Nginx', link: '/fa/Nginx-Configuration'},
      {text: '🔒 گواهی‌های SSL', link: '/fa/SSL-Certificates'},
      {text: '☁️ اجرا پشت CDN', link: '/fa/CDN-Setup'},
      {text: '🧭 اجرا روی Subpath', link: '/fa/Subpath-Hosting'},
    ],
  },
  {
    text: '⚙️ پیکربندی',
    collapsed: false,
    items: [
      {text: '🔧 متغیرهای محیطی', link: '/fa/Environment-Variables'},
      {text: '📡 راه‌اندازی Remote Channel', link: '/fa/Remote-Channel-Setup'},
      {text: '🔔 پراکسی Push Notification', link: '/fa/Push-Notification-Proxy'},
    ],
  },
  {
    text: '🔨 عملیات',
    collapsed: false,
    items: [
      {text: '🔄 به‌روزرسانی', link: '/fa/Updating'},
      {text: '🗃️ دستورات دیتابیس', link: '/fa/Database-Commands'},
      {text: '🩺 عیب‌یابی', link: '/fa/Troubleshooting'},
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Songbird Docs',
  description: 'Documentation of Songbird, a secure, lightweight, self-hosted chat platform.',

  // Served from a custom domain at the site root.
  base: '/',

  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  head: [
    ['link', {rel: 'icon', href: '/favicon.ico'}],
  ],

  themeConfig: {
    // Shared across locales
    logo: '/songbird-logo.svg',

    socialLinks: [
      {icon: 'github', link: 'https://github.com/bllackbull/Songbird'},
      {icon: 'telegram', link: 'https://t.me/songbirdapp'},
      {icon: 'linkedin', link: 'https://www.linkedin.com/in/pouyakhalilii/'}
    ],

    search: {
      provider: 'local',
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          {text: 'Home', link: '/'},
          {text: 'Get Started', link: '/Deployment-Script'},
          {text: 'Releases', link: 'https://github.com/bllackbull/Songbird/releases'},
        ],
        sidebar: enSidebar,
        editLink: {
          pattern: 'https://github.com/bllackbull/Songbird/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 Songbird',
        },
      },
    },

    fa: {
      label: 'فارسی',
      lang: 'fa-IR',
      link: '/fa/',
      themeConfig: {
        nav: [
          {text: 'خانه', link: '/fa/'},
          {text: 'شروع کنید', link: '/fa/Deployment-Script'},
          {text: 'نسخه‌ها', link: 'https://github.com/bllackbull/Songbird/releases'},
        ],
        sidebar: faSidebar,
        editLink: {
          pattern: 'https://github.com/bllackbull/Songbird/edit/main/docs/:path',
          text: 'ویرایش این صفحه در GitHub',
        },
        footer: {
          message: 'تحت لایسنس MIT منتشر شده است.',
          copyright: 'کپی‌رایت © ۲۰۲۶ Songbird',
        },
        docFooter: {
          prev: 'صفحه قبل',
          next: 'صفحه بعد',
        },
        outline: {label: 'در این صفحه'},
        lastUpdated: {text: 'آخرین به‌روزرسانی'},
        langMenuLabel: 'تغییر زبان',
        returnToTopLabel: 'بازگشت به بالا',
        sidebarMenuLabel: 'منو',
        darkModeSwitchLabel: 'حالت تیره',
      },
    },
  },
});
