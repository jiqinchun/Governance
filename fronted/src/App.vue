<template>
  <div class="app-layout" :class="{ 'app-layout--full': isFullBleed }">
    <AppNav />
    <router-view></router-view>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './components/AppNav.vue'

const route = useRoute()
const isFullBleed = computed(() => route.name === 'Home')
</script>

<style>
:root {
  --app-page-width: 1440px;
  --app-page-gutter: 64px;
  --app-bg: #f3f7fd;
  --app-page-gradient:
    radial-gradient(circle at 8% 10%, rgba(88, 104, 242, 0.13), transparent 30%),
    radial-gradient(circle at 88% 18%, rgba(20, 184, 166, 0.055), transparent 28%),
    linear-gradient(135deg, rgba(238, 244, 255, 0.96) 0%, rgba(248, 251, 255, 0.97) 48%, rgba(243, 249, 248, 0.94) 100%);
  --app-surface: rgba(255, 255, 255, 0.9);
  --app-surface-strong: #ffffff;
  --app-border: #dde7f3;
  --app-border-soft: #edf2f8;
  --app-text: #172033;
  --app-muted: #65748a;
  --app-primary: #5868f2;
  --app-primary-dark: #3448d9;
  --app-green: #a8f35d;
  --app-shadow: 0 20px 54px rgba(48, 67, 105, 0.1);
  --app-shadow-soft: 0 12px 30px rgba(48, 67, 105, 0.07);
}

body {
  margin: 0;
  background:
    radial-gradient(circle at 16% 8%, rgba(88, 104, 242, 0.12), transparent 28%),
    radial-gradient(circle at 86% 12%, rgba(20, 184, 166, 0.055), transparent 25%),
    var(--app-bg);
  color: var(--app-text);
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
.app-layout {
  min-height: 100vh;
  padding: 0 0 48px;
  display: flex;
  flex-direction: column;
}
.app-layout--full {
  padding: 0;
  display: block;
}

.app-layout > :not(.app-nav) {
  margin-top: 0;
  align-self: center;
}

.app-layout--full > :not(.app-nav) {
  margin-top: 0;
}
</style>
