<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WalletButton from './WalletButton.vue'

const route = useRoute()
const router = useRouter()

const navItems = [
  { label: 'Governance', path: '/proposals', match: ['Proposals', 'ParameterProposalDetail', 'UpgradeProposalDetail'] },
  { label: 'Treasury', path: '/treasury', match: ['Treasury'] },
  { label: 'Research', path: '/', match: [] },
  { label: 'Voters', path: '/', match: [] },
  { label: 'Resources', path: '/', match: [] }
]

const isActive = (item) => item.match.includes(route.name)
const isHome = computed(() => route.name === 'Home')

const goHome = () => router.push('/')
const goTo = (item) => router.push(item.path)
</script>

<template>
  <header class="app-nav" :class="{ 'app-nav--home': isHome }">
    <div class="app-nav__inner">
      <button class="app-brand" type="button" aria-label="Go home" @click="goHome">
        <span class="app-brand__mark" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </span>
      </button>

      <nav class="app-nav__links" aria-label="Primary navigation">
        <button
          v-for="item in navItems"
          :key="item.label"
          class="app-nav__link"
          :class="{ 'is-active': isActive(item) }"
          type="button"
          @click="goTo(item)"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="app-nav__right">
        <span class="rewards-link">Your Rewards</span>
        <WalletButton />
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  width: 100%;
  box-sizing: border-box;
  padding: 15px 0;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid var(--app-border);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(18px);
}

.app-nav__inner {
  width: min(var(--app-page-width), calc(100% - var(--app-page-gutter)));
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 22px;
}

.app-brand,
.app-nav__link {
  font: inherit;
  border: 0;
  cursor: pointer;
}

.app-brand {
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 14px;
  background: #121b2f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 22px rgba(18, 27, 47, 0.16);
}

.app-brand__mark {
  position: relative;
  display: grid;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  transform: rotate(-24deg);
}

.app-brand__mark span {
  display: block;
  height: 6.5px;
  border-radius: 999px;
}

.app-brand__mark span:nth-child(1) { background: #6D5BFF; }
.app-brand__mark span:nth-child(2) { background: #20D4A8; }
.app-brand__mark span:nth-child(3) { background: #A6F36C; }
.app-brand__mark span:nth-child(4) { background: #48A8FF; }

.app-nav__links {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.app-nav__links::-webkit-scrollbar {
  display: none;
}

.app-nav__link {
  height: 40px;
  padding: 0 17px;
  border-radius: 12px;
  background: transparent;
  color: #2d384d;
  font-weight: 800;
  font-size: 16px;
  white-space: nowrap;
  transition: background-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.app-nav__link:hover {
  background: #f3f6fb;
}

.app-nav__link.is-active {
  color: var(--app-primary-dark);
  background: #eef2ff;
  box-shadow: inset 0 0 0 1px rgba(88, 104, 242, 0.22);
}

.app-nav__right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.rewards-link {
  color: #2d384d;
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .app-nav__link {
    transition: none;
  }
}

@media (max-width: 640px) {
  .app-nav {
    padding: 12px 0;
  }

  .app-nav__inner {
    width: calc(100% - 24px);
    gap: 10px;
  }

  .app-brand {
    width: 38px;
    height: 38px;
    border-radius: 12px;
  }

  .app-nav__link {
    height: 36px;
    padding: 0 11px;
    font-size: 13px;
  }

  .app-nav__right {
    min-width: 0;
    gap: 0;
  }

  .rewards-link {
    display: none;
  }
}
</style>
