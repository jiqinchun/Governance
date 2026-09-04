<template>
  <div class="proposal-detail-container">
    <div class="top-actions">
      <a-button class="action-btn go-back" @click="goBack">
        <template #icon><ArrowLeftOutlined /></template>
        Go Back
      </a-button>
      <div class="right-links">
        <a-button class="action-btn link-btn" :loading="isLoading" @click="refreshAll">
          Refresh <ReloadOutlined class="link-icon" />
        </a-button>
      </div>
    </div>

    <a-row :gutter="24" class="main-grid">
      <a-col :xs="24" :lg="14">
        <div class="detail-card left-card">
          <div class="card-header">
            <h2>Treasury Proposal Overview</h2>
          </div>

          <div class="card-body">
            <div class="info-row state-row">
              <div class="state-group">
                <span class="label text-faint">State</span>
                <div :class="['state-tag', proposalState.toLowerCase()]">
                  <span class="dot"></span> {{ proposalState }}
                </div>
              </div>
              <div class="voting-end text-faint">
                Voting ends <span class="text-bold">{{ endTimeStr }}</span>
              </div>
            </div>

            <div class="info-row creator-row">
              <div class="info-block">
                <div class="label text-faint">Created</div>
                <div class="value text-bold">{{ createdDateObj }}</div>
              </div>
              <div class="info-block">
                <div class="label text-faint">Created By</div>
                <div class="value address-link">{{ proposerShort }}</div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="content-section">
              <div class="label text-faint">Title</div>
              <h3 class="proposal-title text-bold">{{ proposalTitle }}</h3>
            </div>

            <div class="content-section">
              <div class="label text-faint">Summary</div>
              <p class="description-text">{{ summaryText }}</p>
            </div>

            <div class="content-section">
              <div class="label text-faint">Full Description</div>
              <p class="description-text pre-line">{{ descriptionInfo }}</p>
            </div>

            <div class="divider"></div>

            <div class="treasury-transfer-grid">
              <div class="transfer-field">
                <span class="label text-faint">Asset</span>
                <span class="value text-bold">{{ assetSymbol }}</span>
              </div>
              <div class="transfer-field">
                <span class="label text-faint">Amount</span>
                <span class="value text-bold">{{ amountLabel }}</span>
              </div>
              <div class="transfer-field transfer-field--wide">
                <span class="label text-faint">Token Address</span>
                <span class="value mono">{{ tokenAddress }}</span>
              </div>
              <div class="transfer-field transfer-field--wide">
                <span class="label text-faint">Target</span>
                <span class="value mono">{{ targetAddress }}</span>
              </div>
            </div>
          </div>
        </div>
      </a-col>

      <a-col :xs="24" :lg="10">
        <div class="detail-card right-card voting-info">
          <div class="card-header">
            <h2>Voting Info</h2>
          </div>
          <div class="card-body">
            <div class="voting-power-row">
              <span class="label text-faint">Wallet</span>
              <span class="value text-bold">{{ walletLabel }}</span>
            </div>
            <div class="voting-power-row">
              <span class="label text-faint">Required Quorum</span>
              <span class="value text-bold">{{ requiredQuorumLabel }}</span>
            </div>

            <div class="vote-buttons">
              <a-button class="vote-btn btn-for" :disabled="proposalState !== 'Active'" :loading="isVotingFor" @click="handleVote(true)">
                <template #icon><LikeOutlined /></template>
                Vote For
              </a-button>
              <a-button class="vote-btn btn-against" :disabled="proposalState !== 'Active'" :loading="isVotingAgainst" @click="handleVote(false)">
                <template #icon><DislikeOutlined /></template>
                Vote Against
              </a-button>
            </div>

            <div v-if="proposalState === 'Pending' || proposalState === 'Active'" class="hint-text">
              PunkChain uses real block time. Refresh after the voting window changes.
            </div>
            <div v-else class="hint-text">
              Voting is only available while the proposal is Active.
            </div>
          </div>
        </div>

        <div class="detail-card right-card voting-result">
          <div class="card-header">
            <h2>Voting Result</h2>
          </div>
          <div class="card-body">
            <div class="charts-row">
              <div class="chart-group">
                <div class="chart-box for-chart">
                  <div class="chart-label text-faint">Votes For</div>
                  <div class="chart-value text-bold">{{ votesFor.toLocaleString() }}</div>
                </div>
                <div class="chart-circle">
                  <a-progress type="circle" :percent="percentFor" :width="60" strokeColor="#10B981" class="custom-progress" />
                </div>
              </div>

              <div class="chart-group">
                <div class="chart-box against-chart">
                  <div class="chart-label text-faint">Votes Against</div>
                  <div class="chart-value against-value text-bold">{{ votesAgainst.toLocaleString() }}</div>
                </div>
                <div class="chart-circle">
                  <a-progress type="circle" :percent="percentAgainst" :width="60" strokeColor="#EF4444" class="custom-progress custom-progress-red" />
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="stats-list">
              <div class="stat-row">
                <div class="stat-label text-faint">Current Votes</div>
                <div class="stat-value text-bold">{{ currentVotes.toLocaleString() }}</div>
              </div>
              <div class="stat-row">
                <div class="stat-label text-faint">Approval Rate</div>
                <div class="stat-value text-bold">{{ approvalRateLabel }}</div>
              </div>
              <div class="stat-row">
                <div class="stat-label text-faint">Passing</div>
                <div class="stat-value text-bold">{{ isPassing ? 'Yes' : 'No' }}</div>
              </div>
            </div>

            <div class="execute-action">
              <a-button
                type="primary"
                block
                size="large"
                class="execute-btn"
                :disabled="proposalState !== 'Succeeded'"
                :loading="isExecuting"
                @click="executeProposal"
              >
                Execute Transfer
              </a-button>
              <div v-if="proposalState !== 'Succeeded'" class="hint-text center">
                Execution is available after the proposal succeeds.
              </div>
            </div>
          </div>
        </div>

        <div class="detail-card right-card treasury-runtime">
          <div class="card-header">
            <h2>Treasury Runtime</h2>
          </div>
          <div class="card-body">
            <div class="stats-list">
              <div class="stat-row">
                <div class="stat-label text-faint">Asset Balance</div>
                <div class="stat-value text-bold">{{ treasuryBalanceLabel }}</div>
              </div>
              <div class="stat-row">
                <div class="stat-label text-faint">Deposited</div>
                <div class="stat-value text-bold">{{ depositedLabel }}</div>
              </div>
              <div class="stat-row">
                <div class="stat-label text-faint">Withdrawn</div>
                <div class="stat-value text-bold">{{ withdrawnLabel }}</div>
              </div>
            </div>
          </div>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ethers } from 'ethers'
import TreasuryArtifact from '../../../artifacts/contracts/Treasury.sol/Treasury.json'
import treasuryDeployedData from '../../../scripts/treaury_process/deployed.json'
import { useWallet } from '../composables/useWallet'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  LikeOutlined,
  DislikeOutlined
} from '@ant-design/icons-vue'

const router = useRouter()
const route = useRoute()
const { account, chainId, connect, getSigner, switchToPunkChain, shortAddress: connectedShortAddress } = useWallet()

const RPC_URL = import.meta.env.VITE_TREASURY_RPC_URL || 'http://47.243.174.71:36054'
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || treasuryDeployedData.treasury || ''
const PUNKCHAIN_CHAIN_ID = '0x1352826'
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const STATE_MAPPING = ['Pending', 'Active', 'Succeeded', 'Defeated', 'Executed', 'Canceled']
const VOTING_DELAY = 60

const currentProposalId = route.params.id
const provider = new ethers.JsonRpcProvider(RPC_URL)

const isLoading = ref(false)
const isVotingFor = ref(false)
const isVotingAgainst = ref(false)
const isExecuting = ref(false)

const proposalState = ref('Loading')
const proposerInfo = ref('')
const tokenAddress = ref('')
const targetAddress = ref('')
const amountRaw = ref(0n)
const descriptionInfo = ref('')
const startTime = ref(0)
const endTime = ref(0)
const votesForRaw = ref(0n)
const votesAgainstRaw = ref(0n)
const requiredQuorumRaw = ref(0n)
const hasQuorum = ref(false)
const isPassing = ref(false)
const assetSymbol = ref('Asset')
const assetDecimals = ref(18)
const treasuryBalanceRaw = ref(0n)
const depositedRaw = ref(0n)
const withdrawnRaw = ref(0n)

const goBack = () => {
  router.push('/treasury')
}

const short = (address) => {
  if (!address || !ethers.isAddress(address)) return 'Not configured'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const formatTokenAmount = (amount, decimals = 18) => {
  try {
    const value = Number(ethers.formatUnits(amount || 0n, decimals))
    if (!Number.isFinite(value)) return '0'
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
    return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
  } catch {
    return '0'
  }
}

const buildTreasuryProposalTitle = (amount, decimals, symbol, target) => (
  `Treasury proposal to transfer ${formatTokenAmount(amount, decimals)} ${symbol} to ${target}`
)

const createdDateObj = computed(() => {
  if (!startTime.value) return 'Loading...'
  const d = new Date((Number(startTime.value) - VOTING_DELAY) * 1000)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

const endTimeStr = computed(() => {
  if (!endTime.value) return 'TBD'
  const d = new Date(Number(endTime.value) * 1000)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

const proposalTitle = computed(() => buildTreasuryProposalTitle(
  amountRaw.value,
  assetDecimals.value,
  assetSymbol.value,
  targetAddress.value || 'target'
))

const summaryText = computed(() => {
  if (!descriptionInfo.value) return 'Loading...'
  const firstDot = descriptionInfo.value.indexOf('.')
  return firstDot !== -1 ? descriptionInfo.value.substring(0, firstDot + 1) : descriptionInfo.value
})

const proposerShort = computed(() => short(proposerInfo.value))
const walletLabel = computed(() => account.value ? connectedShortAddress.value : 'Not connected')
const amountLabel = computed(() => `${formatTokenAmount(amountRaw.value, assetDecimals.value)} ${assetSymbol.value}`)
const treasuryBalanceLabel = computed(() => `${formatTokenAmount(treasuryBalanceRaw.value, assetDecimals.value)} ${assetSymbol.value}`)
const depositedLabel = computed(() => `${formatTokenAmount(depositedRaw.value, assetDecimals.value)} ${assetSymbol.value}`)
const withdrawnLabel = computed(() => `${formatTokenAmount(withdrawnRaw.value, assetDecimals.value)} ${assetSymbol.value}`)
const votesFor = computed(() => Number(ethers.formatEther(votesForRaw.value || 0n)))
const votesAgainst = computed(() => Number(ethers.formatEther(votesAgainstRaw.value || 0n)))
const currentVotes = computed(() => votesFor.value + votesAgainst.value)
const percentFor = computed(() => currentVotes.value === 0 ? 0 : Number(((votesFor.value / currentVotes.value) * 100).toFixed(2)))
const percentAgainst = computed(() => currentVotes.value === 0 ? 0 : Number(((votesAgainst.value / currentVotes.value) * 100).toFixed(2)))
const approvalRateLabel = computed(() => `${percentFor.value.toFixed(2)}%`)
const requiredQuorumLabel = computed(() => `${formatTokenAmount(requiredQuorumRaw.value, 18)} GOV`)

const getReadContract = () => (
  new ethers.Contract(TREASURY_ADDRESS, TreasuryArtifact.abi, provider)
)

const getWriteContract = async () => {
  if (chainId.value?.toLowerCase() !== PUNKCHAIN_CHAIN_ID) {
    const switched = await switchToPunkChain()
    if (!switched) return null
  }

  let signer = await getSigner()
  if (!signer) {
    const connected = await connect()
    if (!connected) return null
    signer = await getSigner()
  }

  return new ethers.Contract(TREASURY_ADDRESS, TreasuryArtifact.abi, signer)
}

const fetchProposalData = async () => {
  const treasury = getReadContract()

  const [basic, details, voting] = await Promise.all([
    treasury.getProposalBasic(currentProposalId),
    treasury.getProposalDetails(currentProposalId),
    treasury.getVotingResults(currentProposalId)
  ])

  proposalState.value = STATE_MAPPING[Number(basic.state ?? basic[5])] || 'Unknown'
  proposerInfo.value = basic.proposer ?? basic[1]
  tokenAddress.value = basic.token ?? basic[2]
  targetAddress.value = basic.target ?? basic[3]
  descriptionInfo.value = basic.description ?? basic[4]

  amountRaw.value = details.amount ?? details[0]
  startTime.value = Number(details.startTime ?? details[1])
  endTime.value = Number(details.endTime ?? details[2])
  votesForRaw.value = details.forVotes ?? details[3]
  votesAgainstRaw.value = details.againstVotes ?? details[4]
  requiredQuorumRaw.value = voting.requiredQuorum ?? voting[4]
  hasQuorum.value = Boolean(voting.hasQuorum ?? voting[5])
  isPassing.value = Boolean(voting.isPassing ?? voting[6])
}

const fetchAssetStats = async () => {
  if (!tokenAddress.value) return
  const treasury = getReadContract()
  const stats = await treasury.getAssetStats(tokenAddress.value)

  assetSymbol.value = stats.symbol || stats[1] || (tokenAddress.value.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? 'PUNK' : 'Asset')
  assetDecimals.value = Number(stats.decimals ?? stats[2] ?? 18)
  treasuryBalanceRaw.value = stats.balance ?? stats[3]
  depositedRaw.value = stats.totalDeposited ?? stats[4]
  withdrawnRaw.value = stats.totalWithdrawn ?? stats[5]
}

const refreshAll = async () => {
  isLoading.value = true
  try {
    await fetchProposalData()
    await fetchAssetStats()
  } catch (error) {
    console.error('Failed to load treasury proposal:', error)
    message.error(`Failed to load treasury proposal: ${error.shortMessage || error.reason || error.message}`)
  } finally {
    isLoading.value = false
  }
}

const handleVote = async (support) => {
  if (support) {
    isVotingFor.value = true
  } else {
    isVotingAgainst.value = true
  }

  try {
    const treasury = await getWriteContract()
    if (!treasury) return

    const tx = await treasury.vote(currentProposalId, support)
    await tx.wait()

    message.success(`Vote ${support ? 'for' : 'against'} submitted`)
    await refreshAll()
  } catch (error) {
    console.error('Treasury vote failed:', error)
    message.error(`Vote failed: ${error.shortMessage || error.reason || error.message}`)
  } finally {
    isVotingFor.value = false
    isVotingAgainst.value = false
  }
}

const executeProposal = async () => {
  isExecuting.value = true
  try {
    const treasury = await getWriteContract()
    if (!treasury) return

    const tx = await treasury.execute(currentProposalId)
    await tx.wait()

    message.success('Treasury proposal executed successfully')
    await refreshAll()
  } catch (error) {
    console.error('Treasury execution failed:', error)
    message.error(`Execution failed: ${error.shortMessage || error.reason || error.message}`)
  } finally {
    isExecuting.value = false
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.proposal-detail-container {
  width: min(var(--app-page-width), calc(100% - var(--app-page-gutter)));
  margin: 0 auto;
  min-height: calc(100vh - 73px);
  padding: 28px;
  box-sizing: border-box;
  background: var(--app-page-gradient);
  border: 1px solid var(--app-border);
  border-top: 0;
  border-radius: 0 0 24px 24px;
  box-shadow: var(--app-shadow);
}

.text-faint {
  color: #6B7280;
  font-size: 14px;
}
.text-bold {
  color: #111827;
  font-weight: 600;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: #374151;
  overflow-wrap: anywhere;
}
.divider {
  height: 1px;
  background-color: #F3F4F6;
  margin: 20px 0;
}

.top-actions {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}
.right-links {
  display: flex;
  gap: 16px;
}
.action-btn {
  height: 40px;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
  color: #374151;
  font-weight: 500;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.link-btn .link-icon {
  margin-left: 8px;
  color: #6B7280;
  font-size: 14px;
}

.detail-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  border: 1px solid #F3F4F6;
  margin-bottom: 24px;
  overflow: hidden;
}
.card-header {
  padding: 20px 24px;
  border-bottom: 1px solid #F3F4F6;
}
.card-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.card-body {
  padding: 24px;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
}
.state-row {
  gap: 20px;
  flex-wrap: wrap;
}
.state-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.state-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}
.state-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}
.state-tag.active {
  background: #EEF2FF;
  color: #4F46E5;
  border: 1px solid #E0E7FF;
}
.state-tag.active .dot { background-color: #4F46E5; }
.state-tag.succeeded {
  background: #ECFDF5;
  color: #10B981;
  border: 1px solid #D1FAE5;
}
.state-tag.succeeded .dot { background-color: #10B981; }
.state-tag.executed {
  background: #FFFFFF;
  color: #009ACD;
  border: 1px solid #8EE5EE;
}
.state-tag.executed .dot { background-color: #009ACD; }
.state-tag.pending {
  background: #FFFBEB;
  color: #D97706;
  border: 1px solid #FEF3C7;
}
.state-tag.pending .dot { background-color: #D97706; }
.state-tag.canceled,
.state-tag.defeated {
  background: #FEF2F2;
  color: #EF4444;
  border: 1px solid #FEE2E2;
}
.state-tag.canceled .dot,
.state-tag.defeated .dot { background-color: #EF4444; }

.creator-row {
  gap: 60px;
  flex-wrap: wrap;
}
.info-block .label {
  margin-bottom: 4px;
}
.info-block .value {
  font-size: 15px;
}
.address-link {
  color: #4F46E5 !important;
  display: flex;
  align-items: center;
}

.content-section {
  margin-bottom: 24px;
}
.content-section .label {
  margin-bottom: 8px;
}
.proposal-title {
  font-size: 16px;
  margin: 0;
}
.description-text {
  font-size: 15px;
  line-height: 1.6;
  color: #374151;
  margin: 0;
}
.pre-line {
  white-space: pre-wrap;
}

.treasury-transfer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.transfer-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
  border-radius: 8px;
}
.transfer-field--wide {
  grid-column: 1 / -1;
}

.voting-power-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
}
.vote-buttons {
  display: flex;
  gap: 12px;
}
.vote-btn {
  flex: 1;
  height: 40px;
  border-radius: 6px;
  font-weight: 600;
  display: flex;
  justify-content: center;
  align-items: center;
}
.btn-for {
  color: #10B981;
  border: 1px solid #10B981;
  background: #F0FDF4;
}
.btn-against {
  color: #EF4444;
  border: 1px solid #EF4444;
  background: #FEF2F2;
}
.hint-text {
  margin-top: 12px;
  color: #DC2626;
  font-size: 13px;
}
.hint-text.center {
  text-align: center;
}

.charts-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.chart-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chart-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}
.chart-label {
  font-size: 13px;
}
.chart-value {
  font-size: 16px;
}
.against-value {
  color: #EF4444;
}
.chart-circle {
  display: flex;
  align-items: center;
}
:deep(.custom-progress .ant-progress-text) {
  color: #10B981;
  font-weight: 600;
  font-size: 13px !important;
}
:deep(.custom-progress-red .ant-progress-text) {
  color: #EF4444;
  font-size: 13px !important;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.stat-value {
  font-size: 14px;
  text-align: right;
}
.execute-action {
  margin-top: 24px;
}
.execute-btn {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.3s ease;
}
.execute-btn.ant-btn-primary:not([disabled]) {
  background: #7370DC;
  border: none;
  box-shadow: none;
}
.execute-btn.ant-btn-primary:not([disabled]):hover {
  transform: translateY(-1px);
  background: #8481E6;
  box-shadow: 0 4px 10px rgba(115, 112, 220, 0.2);
  color: #fff;
}
.execute-btn.ant-btn-primary:not([disabled]):active {
  transform: translateY(1px);
  box-shadow: none;
}

@media (max-width: 980px) {
  .top-actions,
  .vote-buttons {
    flex-direction: column;
  }
  .treasury-transfer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
