<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ethers } from 'ethers'
import TreasuryArtifact from '../../../artifacts/contracts/Treasury.sol/Treasury.json'
import ParameterRegistryArtifact from '../../../artifacts/contracts/ParameterRegistry.sol/ParameterRegistry.json'
import UpgradeGovernanceArtifact from '../../../artifacts/contracts/UpgradeGovernance.sol/UpgradeGovernance.json'
import treasuryDeployedData from '../../../scripts/treaury_process/deployed.json'
import parameterDeployedData from '../../../scripts/upgrade_process/deployed.json'
import upgradeDeployedData from '../../../scripts/contract_upgrade_process/deployed.json'

const router = useRouter()

const RPC_URL = import.meta.env.VITE_TREASURY_RPC_URL || 'http://47.243.174.71:36054'

const stats = ref([
  { key: 'aum', label: 'Assets under management', value: '0' },
  { key: 'proposals', label: 'Total proposals', value: '0' },
  { key: 'votes', label: 'Total votes', value: '0' },
  { key: 'members', label: 'Members', value: '0' }
])

const overviewLoaded = ref(false)
const statsFresh = ref(false)
const pointerX = ref(0)
const pointerY = ref(0)
let statsFreshTimer = null

const topoRings = Array.from({ length: 30 }, (_, i) => 60 + i * 22)

const launch = () => router.push('/proposals')
const openTreasury = () => router.push('/treasury')

const homeMotionStyle = computed(() => ({
  '--home-x': `${pointerX.value}px`,
  '--home-y': `${pointerY.value}px`,
  '--home-topo-x': `${Number((pointerX.value * -0.35).toFixed(2))}px`,
  '--home-topo-y': `${Number((pointerY.value * -0.45).toFixed(2))}px`,
  '--home-stats-x': `${Number((pointerX.value * 0.08).toFixed(2))}px`,
  '--home-stats-y': `${Number((pointerY.value * 0.06).toFixed(2))}px`
}))

const formatCompactNumber = (value, maximumFractionDigits = 2) => {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${(value / 1000000).toFixed(maximumFractionDigits)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(maximumFractionDigits)}K`
  return value.toLocaleString('en-US', { maximumFractionDigits })
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
)

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)

const animateStatsTo = (targets) => {
  const formatters = {
    aum: (value) => formatCompactNumber(value),
    proposals: (value) => Math.round(value).toLocaleString('en-US'),
    votes: (value) => formatCompactNumber(value),
    members: (value) => Math.round(value).toLocaleString('en-US')
  }

  if (prefersReducedMotion()) {
    stats.value = targets.map((item) => ({
      key: item.key,
      label: item.label,
      value: formatters[item.key](item.raw)
    }))
    overviewLoaded.value = true
    return
  }

  const startedAt = performance.now()
  const duration = 950

  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1)
    const eased = easeOutCubic(progress)

    stats.value = targets.map((item) => ({
      key: item.key,
      label: item.label,
      value: formatters[item.key](item.raw * eased)
    }))

    if (progress < 1) {
      window.requestAnimationFrame(tick)
    } else {
      overviewLoaded.value = true
      statsFresh.value = true
      window.clearTimeout(statsFreshTimer)
      statsFreshTimer = window.setTimeout(() => {
        statsFresh.value = false
      }, 1100)
    }
  }

  window.requestAnimationFrame(tick)
}

const handleHomePointerMove = (event) => {
  if (prefersReducedMotion()) return

  const bounds = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14
  const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10

  pointerX.value = Number(x.toFixed(2))
  pointerY.value = Number(y.toFixed(2))
}

const resetHomePointer = () => {
  pointerX.value = 0
  pointerY.value = 0
}

const toTokenNumber = (amount, decimals = 18) => {
  try {
    const value = Number(ethers.formatUnits(amount || 0n, decimals))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

const readEventsWithFallback = async (contract, filter) => {
  try {
    return await contract.queryFilter(filter, 0, 'latest')
  } catch (error) {
    console.warn('Full event scan failed on home, retrying recent blocks', error)
    const latestBlock = await contract.runner.provider.getBlockNumber()
    return contract.queryFilter(filter, Math.max(0, latestBlock - 50000), 'latest')
  }
}

const getProposalVotes = async (contract, proposalId) => {
  const details = await contract.getProposalDetails(proposalId)
  return (details.forVotes ?? details[3] ?? 0n) + (details.againstVotes ?? details[4] ?? 0n)
}

const fetchTreasuryAum = async (treasury) => {
  let tokens = []
  try {
    tokens = await treasury.getAllAssets()
  } catch {
    tokens = await treasury.getAdmittedAssets()
  }

  const balances = await Promise.all(tokens.map(async (token) => {
    const assetStats = await treasury.getAssetStats(token)
    const decimals = Number(assetStats.decimals ?? assetStats[2] ?? 18)
    const balance = assetStats.balance ?? assetStats[3]
    return toTokenNumber(balance, decimals)
  }))

  return balances.reduce((total, value) => total + value, 0)
}

const fetchGovernanceOverview = async () => {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const treasury = new ethers.Contract(treasuryDeployedData.treasury, TreasuryArtifact.abi, provider)
  const parameterRegistry = new ethers.Contract(parameterDeployedData.paramRegistry, ParameterRegistryArtifact.abi, provider)
  const upgradeGovernance = new ethers.Contract(upgradeDeployedData.upgradeGovernance, UpgradeGovernanceArtifact.abi, provider)

  const governanceContracts = [treasury, parameterRegistry, upgradeGovernance]

  try {
    const [aum, counts, voteEvents] = await Promise.all([
      fetchTreasuryAum(treasury),
      Promise.all(governanceContracts.map(async (contract) => Number(await contract.proposalCount()))),
      Promise.all(governanceContracts.map((contract) => readEventsWithFallback(contract, contract.filters.VoteCast())))
    ])

    const votesByContract = await Promise.all(governanceContracts.map(async (contract, index) => {
      const proposalCount = counts[index]
      const proposalIds = Array.from({ length: proposalCount }, (_, proposalIndex) => proposalIndex + 1)
      const proposalVotes = await Promise.all(proposalIds.map((id) => getProposalVotes(contract, id)))
      return proposalVotes.reduce((total, value) => total + value, 0n)
    }))

    const totalVotes = votesByContract.reduce((total, value) => total + value, 0n)
    const uniqueMembers = new Set([
      ...(treasuryDeployedData.voters || []),
      ...(upgradeDeployedData.voters || []),
      ...voteEvents.flat().map((event) => event.args?.voter ?? event.args?.[0] ?? '')
    ].map((address) => String(address).toLowerCase()).filter(Boolean))

    animateStatsTo([
      { key: 'aum', label: 'Assets under management', raw: aum },
      { key: 'proposals', label: 'Total proposals', raw: counts.reduce((total, value) => total + value, 0) },
      { key: 'votes', label: 'Total votes', raw: Number(ethers.formatEther(totalVotes)) },
      { key: 'members', label: 'Members', raw: uniqueMembers.size }
    ])
  } catch (error) {
    console.error('Failed to load home governance overview:', error)
    const fallbackMembers = new Set([
      ...(treasuryDeployedData.voters || []),
      ...(upgradeDeployedData.voters || [])
    ].map((address) => String(address).toLowerCase()).filter(Boolean))
    animateStatsTo([
      { key: 'aum', label: 'Assets under management', raw: (treasuryDeployedData.assets || []).reduce((total, asset) => total + Number(asset.treasuryBalance || 0), 0) },
      { key: 'proposals', label: 'Total proposals', raw: 0 },
      { key: 'votes', label: 'Total votes', raw: 0 },
      { key: 'members', label: 'Members', raw: fallbackMembers.size }
    ])
  }
}

onMounted(fetchGovernanceOverview)
</script>

<template>
  <main class="dao-home">
    <div
      class="page-card"
      :style="homeMotionStyle"
      @pointermove="handleHomePointerMove"
      @pointerleave="resetHomePointer"
    >
      <section class="hero">
        <svg class="hero-topo" viewBox="-700 -460 1400 920"
          preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <defs>
            <filter id="topoDisplace" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.0045"
                numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="58"
                xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <radialGradient id="topoFade" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
              <stop offset="65%" stop-color="#FFFFFF" stop-opacity="0" />
              <stop offset="100%" stop-color="#FFFFFF" stop-opacity="1" />
            </radialGradient>
          </defs>
          <g class="topo-lines" filter="url(#topoDisplace)" fill="none" stroke="#D5DBE3" stroke-width="0.75">
            <circle v-for="r in topoRings" :key="r" cx="0" cy="0" :r="r" />
          </g>
          <rect x="-700" y="-460" width="1400" height="920" fill="url(#topoFade)" />
        </svg>

        <div class="hero-inner">
          <h1 class="hero-title">Join the community,<br />change the future.</h1>
          <p class="hero-sub">The token that gives you the power to bring about real change.</p>

          <div
            class="stats-card"
            :class="{
              'stats-card--loaded': overviewLoaded,
              'stats-card--fresh': statsFresh
            }"
          >
            <article class="stat" v-for="(s, i) in stats" :key="s.key"
              :class="{ 'stat--first': i === 0 }"
              :style="{ '--stat-index': i }">
              <header class="stat-head">
                <span class="stat-icon" aria-hidden="true">
                  <svg v-if="s.key === 'aum'" viewBox="0 0 24 24" width="18" height="18"
                    fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M14.6 9.4c-.5-1-1.5-1.6-2.6-1.6-1.6 0-2.6 1-2.6 2.2 0 2.7 5.2 1.6 5.2 4.3 0 1.2-1.1 2.3-2.6 2.3-1.1 0-2.1-.6-2.6-1.6" />
                    <path d="M12 6v2M12 16v2" />
                  </svg>
                  <svg v-else-if="s.key === 'proposals'" viewBox="0 0 24 24" width="18" height="18"
                    fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16.5 3.5l4 4-12 12-4.5.5.5-4.5z" />
                    <path d="M14 6l4 4" />
                  </svg>
                  <svg v-else-if="s.key === 'votes'" viewBox="0 0 24 24" width="18" height="18"
                    fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 11v9H4v-9z" />
                    <path d="M7 11l3.4-6.4c.3-.6 1-.9 1.6-.6.9.4 1.5 1.3 1.5 2.4V10h5.4c1 0 1.8 1 1.6 2l-1.4 7c-.2 1-1 1.6-2 1.6H7" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="18" height="18"
                    fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="8.2" r="3.3" />
                    <path d="M2.8 19.6c.6-3.4 3.1-5.2 6.2-5.2 3.1 0 5.6 1.8 6.2 5.2" />
                    <circle cx="17.2" cy="7" r="2.5" />
                    <path d="M15.6 14c2.7.3 4.6 2.1 5.2 5.2" />
                  </svg>
                </span>
                <span class="stat-label">{{ s.label }}</span>
              </header>
              <div class="stat-value">{{ s.value }}</div>
            </article>
          </div>

          <div class="hero-actions">
            <button class="btn-primary btn-launch" type="button" @click="launch">Join the DAO</button>
            <button class="btn-secondary btn-launch" type="button" @click="openTreasury">View Treasury</button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.dao-home {
  min-height: 100vh;
  background: #DEE7DD;
  padding: 14px;
  display: flex;
  justify-content: center;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif;
  color: #14233E;
}

.page-card {
  position: relative;
  --home-x: 0px;
  --home-y: 0px;
  --home-topo-x: 0px;
  --home-topo-y: 0px;
  --home-stats-x: 0px;
  --home-stats-y: 0px;
  width: 100%;
  max-width: 1640px;
  background: #FFFFFF;
  border-radius: 28px;
  padding: 28px 56px 96px;
  box-shadow: 0 1px 0 rgba(20, 20, 40, 0.04);
  overflow: hidden;
  isolation: isolate;
}

.btn-primary {
  position: relative;
  overflow: hidden;
  background: #5C46FF;
  color: #FFFFFF;
  font-family: inherit;
  font-weight: 700;
  font-size: 15px;
  border: none;
  border-radius: 14px;
  padding: 14px 22px;
  cursor: pointer;
  box-shadow: 0 6px 18px -10px rgba(92, 70, 255, 0.7);
  transition: background-color 200ms ease, transform 80ms ease, box-shadow 200ms ease;
}

.btn-primary::after {
  content: '';
  position: absolute;
  inset: -45% -70%;
  background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, 0.38) 50%, transparent 58%);
  transform: translateX(-70%);
  animation: buttonSheen 6.5s ease-in-out 2.2s infinite;
  pointer-events: none;
}

.btn-primary:hover {
  background: #4A36F0;
  box-shadow: 0 14px 30px -18px rgba(92, 70, 255, 0.9);
  transform: translateY(-1px);
}
.btn-primary:active { transform: translateY(1px); }
.btn-primary:focus-visible { outline: 2px solid #14233E; outline-offset: 2px; }
.btn-primary:disabled { opacity: 0.7; cursor: progress; }

.btn-buy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.btn-buy__icon { display: inline-flex; }

.hero {
  position: relative;
  padding: 48px 0 0;
}

.hero-topo {
  position: absolute;
  inset: -40px 0 0 0;
  width: 100%;
  height: calc(100% + 40px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.9;
  translate: var(--home-topo-x) var(--home-topo-y);
  transform: scale(1.025);
  transition: transform 260ms ease-out;
  will-change: transform;
}

.topo-lines {
  transform-origin: center;
  animation: topoDrift 24s ease-in-out 2s infinite alternate;
}

.topo-lines circle {
  stroke-dasharray: 6 10;
  stroke-dashoffset: 180;
  animation: topoReveal 1800ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.topo-lines circle:nth-child(3n) {
  animation-delay: 80ms;
}

.topo-lines circle:nth-child(3n + 1) {
  animation-delay: 150ms;
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-title {
  margin: 32px 0 24px;
  text-align: center;
  font-weight: 800;
  font-size: clamp(40px, 6.4vw, 96px);
  line-height: 1.04;
  letter-spacing: -0.025em;
  color: #14233E;
  opacity: 0;
  transform: translateY(18px);
  animation: homeFadeUp 720ms cubic-bezier(0.22, 1, 0.36, 1) 120ms forwards;
}

.hero-sub {
  margin: 0 0 64px;
  text-align: center;
  font-size: 18px;
  font-weight: 400;
  color: #6E7A8C;
  opacity: 0;
  transform: translateY(14px);
  animation: homeFadeUp 720ms cubic-bezier(0.22, 1, 0.36, 1) 260ms forwards;
}

.stats-card {
  width: 100%;
  max-width: 1280px;
  background: #FFFFFF;
  border-radius: 18px;
  box-shadow:
    0 18px 50px -28px rgba(28, 36, 60, 0.18),
    0 2px 6px rgba(28, 36, 60, 0.04);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 28px 16px;
  opacity: 0;
  transform: translateY(18px);
  animation: homeFadeUp 780ms cubic-bezier(0.22, 1, 0.36, 1) 420ms forwards;
  translate: var(--home-stats-x) var(--home-stats-y);
  transition: box-shadow 220ms ease, transform 220ms ease;
  will-change: translate;
}

.stats-card:hover {
  box-shadow:
    0 26px 56px -32px rgba(28, 36, 60, 0.26),
    0 6px 16px rgba(28, 36, 60, 0.055);
}

.stat {
  position: relative;
  z-index: 0;
  padding: 8px 36px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-left: 1px solid #ECEEF2;
  opacity: 0;
  transform: translateY(10px);
  animation: statReveal 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: calc(620ms + var(--stat-index) * 90ms);
  transition: background-color 200ms ease, transform 200ms ease;
}

.stat--first { border-left: none; }

.stat::before {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  top: -8px;
  bottom: -8px;
  border-radius: 14px;
  background: #F7F9FF;
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 200ms ease, transform 200ms ease;
  z-index: -1;
}

.stat:hover {
  transform: translateY(-2px);
}

.stat:hover::before {
  opacity: 1;
  transform: scale(1);
}

.stat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2A3548;
  font-size: 14px;
  font-weight: 500;
}

.stat-icon {
  color: #2A3548;
  display: inline-flex;
  transition: color 180ms ease, transform 180ms ease;
}

.stat:hover .stat-icon {
  color: #5C46FF;
  transform: translateY(-1px);
}

.stat-label { white-space: nowrap; }

.stat-value {
  font-weight: 800;
  font-size: 36px;
  letter-spacing: -0.02em;
  color: #14233E;
  font-variant-numeric: tabular-nums;
  transition: color 180ms ease;
}

.stats-card--loaded .stat-value {
  color: #111D35;
}

.stats-card--fresh .stat-value {
  animation: valueRefresh 1000ms ease-out;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 80px;
  flex-wrap: wrap;
  justify-content: center;
  opacity: 0;
  transform: translateY(14px);
  animation: homeFadeUp 680ms cubic-bezier(0.22, 1, 0.36, 1) 760ms forwards;
}

.btn-launch {
  padding: 18px 40px;
  font-size: 16px;
  border-radius: 14px;
}

.btn-secondary {
  background: #FFFFFF;
  color: #14233E;
  border: 1px solid #D7DCE3;
  box-shadow: 0 8px 18px -14px rgba(20, 35, 62, 0.4);
}
.btn-secondary {
  transition: background-color 200ms ease, border-color 200ms ease, transform 80ms ease, box-shadow 200ms ease;
}
.btn-secondary:hover {
  background: #F4F5F7;
  border-color: #C8CED8;
  box-shadow: 0 14px 26px -20px rgba(20, 35, 62, 0.55);
  transform: translateY(-1px);
}

@keyframes homeFadeUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes statReveal {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes topoReveal {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes topoDrift {
  from {
    transform: translate3d(-8px, -4px, 0) rotate(-0.25deg) scale(1);
  }
  to {
    transform: translate3d(10px, 6px, 0) rotate(0.28deg) scale(1.018);
  }
}

@keyframes valueRefresh {
  0% {
    color: #5C46FF;
    text-shadow: 0 0 0 rgba(92, 70, 255, 0);
  }
  35% {
    color: #4A36F0;
    text-shadow: 0 10px 26px rgba(92, 70, 255, 0.18);
  }
  100% {
    color: #111D35;
    text-shadow: none;
  }
}

@keyframes buttonSheen {
  0%, 64% {
    transform: translateX(-70%);
  }
  78%, 100% {
    transform: translateX(70%);
  }
}

@media (max-width: 1100px) {
  .page-card { padding: 24px 28px 72px; border-radius: 24px; }
  .stat { padding: 8px 22px; }
  .stat-value { font-size: 30px; }
}

@media (max-width: 860px) {
  .topnav { display: none; }
  .topbar { gap: 16px; justify-content: space-between; }
  .stats-card { grid-template-columns: repeat(2, 1fr); row-gap: 24px; }
  .stat:nth-child(2) { border-left: 1px solid #ECEEF2; }
  .stat:nth-child(3) { border-left: none; }
  .hero-sub { margin-bottom: 40px; }
  .hero-actions { margin-top: 56px; }
}

@media (max-width: 540px) {
  .dao-home { padding: 8px; }
  .page-card { padding: 18px 18px 56px; border-radius: 20px; }
  .brand-name { font-size: 16px; }
  .btn-buy { padding: 12px 16px; font-size: 14px; }
  .stats-card { grid-template-columns: 1fr; padding: 18px; }
  .stat { border-left: none !important; padding: 12px 8px; border-top: 1px solid #ECEEF2; }
  .stat:first-child { border-top: none; }
  .hero-title { font-size: 40px; }
}

@media (prefers-reduced-motion: reduce) {
  .navlink,
  .btn-primary,
  .btn-secondary,
  .stats-card,
  .stat,
  .stat::before,
  .stat-icon,
  .hero-topo {
    transition: none;
  }

  .hero-title,
  .hero-sub,
  .stats-card,
  .stat,
  .hero-actions,
  .topo-lines,
  .topo-lines circle,
  .stats-card--fresh .stat-value,
  .btn-primary::after {
    animation: none;
    opacity: 1;
    transform: none;
    stroke-dashoffset: 0;
  }

  .hero-topo,
  .stats-card {
    translate: none;
    transform: none;
  }
}
</style>
