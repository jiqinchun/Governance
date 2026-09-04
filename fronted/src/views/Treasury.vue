<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ethers } from 'ethers'
import TreasuryArtifact from '../../../artifacts/contracts/Treasury.sol/Treasury.json'
import treasuryDeployedData from '../../../scripts/treaury_process/deployed.json'
import treasuryStateData from '../../../scripts/treaury_process/state.json'
import { useWallet } from '../composables/useWallet'
import {
  BankOutlined,
  BarChartOutlined,
  TeamOutlined,
  AppstoreOutlined,
  PlusOutlined,
  SearchOutlined,
  CalendarOutlined,
  RiseOutlined,
  FallOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  WalletOutlined,
  CopyOutlined
} from '@ant-design/icons-vue'

const router = useRouter()

const {
  account,
  chainId,
  connect,
  getSigner,
  switchToPunkChain
} = useWallet()

const TREASURY_RPC_URL = import.meta.env.VITE_TREASURY_RPC_URL || 'http://47.243.174.71:36054'
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || treasuryDeployedData.treasury || ''
const PUNKCHAIN_CHAIN_ID = '0x1352826'
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const ASSET_PAGE_SIZE = 6
const PROPOSAL_PAGE_SIZE = 4
const TRANSACTION_PAGE_SIZE = 3

const activeAssetTab = ref('admitted')
const assetPage = ref(1)
const proposalPage = ref(1)
const transactionPage = ref(1)
const searchText = ref('')
const proposalSearchText = ref('')
const transactionSearchText = ref('')
const isTreasuryModalVisible = ref(false)
const isCreatingTreasuryProposal = ref(false)
const isLoadingAssets = ref(false)
const isLoadingProposals = ref(false)
const isLoadingTransactions = ref(false)
const treasuryAssetRows = ref([])
const proposalRows = ref([])
const treasuryTransactions = ref([])
const voterCount = ref(treasuryDeployedData.voters?.length || 0)
const treasuryAssets = ref([
  {
    value: NATIVE_TOKEN,
    label: 'PUNK - Native asset',
    symbol: 'PUNK',
    decimals: 18,
    balance: 0n
  }
])

const treasuryProposalForm = reactive({
  token: NATIVE_TOKEN,
  target: '',
  amount: '',
  description: ''
})

const chartRanges = ['1D', '7D', '1M', '3M', '1Y']
const activeChartMode = ref('balance')
const activeChartRange = ref('1M')
const chartModeOptions = [
  { label: 'Balance', value: 'balance' },
  { label: 'Flow', value: 'flow' }
]

const activeBalanceIndex = ref(null)
const activeFlowIndex = ref(null)

const chartBox = {
  width: 720,
  height: 304,
  top: 26,
  right: 24,
  bottom: 46,
  left: 62
}

const RANGE_DAYS = {
  '1D': 1,
  '7D': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365
}

const PROPOSAL_STATES = ['Pending', 'Active', 'Succeeded', 'Defeated', 'Executed', 'Canceled']

const formatCompactNumber = (value, maximumFractionDigits = 2) => {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${(value / 1000000).toFixed(maximumFractionDigits)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(maximumFractionDigits)}K`
  return value.toLocaleString('en-US', { maximumFractionDigits })
}

const formatChartValue = (value) => formatCompactNumber(value, value >= 1000 ? 2 : 1)
const formatFlow = (value) => formatCompactNumber(value, value >= 1000 ? 2 : 1)
const formatSignedFlow = (value) => `${value >= 0 ? '+' : '-'}${formatFlow(Math.abs(value))}`

const createScale = (rows, keys, minOverride = null) => {
  const values = rows.flatMap((row) => keys.map((key) => row[key]))
  if (!values.length) {
    return { min: 0, max: 1 }
  }
  const min = minOverride ?? Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min) * 0.12 || 1
  return {
    min: minOverride ?? min - padding,
    max: max + padding
  }
}

const chartPoint = (row, index, rows, key, scale) => {
  const plotWidth = chartBox.width - chartBox.left - chartBox.right
  const plotHeight = chartBox.height - chartBox.top - chartBox.bottom
  const x = chartBox.left + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * plotWidth)
  const y = chartBox.top + ((scale.max - row[key]) / (scale.max - scale.min)) * plotHeight
  return { ...row, x, y }
}

const createAxis = (scale, formatter) => {
  const ticks = 5
  const span = scale.max - scale.min || 1
  return Array.from({ length: ticks }, (_, index) => {
    const value = scale.max - (span / (ticks - 1)) * index
    return {
      value,
      label: formatter(value),
      y: chartBox.top + ((scale.max - value) / (scale.max - scale.min || 1)) * (chartBox.height - chartBox.top - chartBox.bottom)
    }
  })
}

const smoothPath = (points, tension = 0.18) => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`

    const previous = points[index - 1]
    const previousAnchor = points[index - 2] || previous
    const nextAnchor = points[index + 1] || point
    const controlOneX = previous.x + (point.x - previousAnchor.x) * tension
    const controlOneY = previous.y + (point.y - previousAnchor.y) * tension
    const controlTwoX = point.x - (nextAnchor.x - previous.x) * tension
    const controlTwoY = point.y - (nextAnchor.y - previous.y) * tension

    return `${path} C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)}, ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  }, '')
}

const areaPath = (points) => {
  if (!points.length) return ''
  const baseline = chartBox.height - chartBox.bottom
  return `${smoothPath(points, 0.18)} L ${points[points.length - 1].x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z`
}

const toDisplayNumber = (amount, decimals = 18) => {
  try {
    const value = Number(ethers.formatUnits(amount || 0n, decimals))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

const treasuryTotalBalance = computed(() => (
  treasuryAssetRows.value.reduce((total, item) => total + toDisplayNumber(item.balance, item.decimals), 0)
))

const activeProposalCount = computed(() => (
  proposalRows.value.filter((item) => item.status === 'Active').length
))

const admittedAssetCount = computed(() => (
  treasuryAssetRows.value.filter((item) => item.isAdmitted).length
))

const stats = computed(() => [
  { key: 'balance', label: 'Treasury Balance', value: formatCompactNumber(treasuryTotalBalance.value), icon: BankOutlined },
  { key: 'proposals', label: 'Active Proposals', value: activeProposalCount.value.toString(), icon: BarChartOutlined },
  { key: 'members', label: 'Voters', value: voterCount.value.toString(), icon: TeamOutlined },
  { key: 'assets', label: 'Assets', value: admittedAssetCount.value.toString(), icon: AppstoreOutlined }
])

const getRangeStart = () => Date.now() - (RANGE_DAYS[activeChartRange.value] || 30) * 24 * 60 * 60 * 1000

const formatBucketLabel = (timestamp) => {
  const date = new Date(timestamp)
  if (activeChartRange.value === '1D') {
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const makeBuckets = () => {
  const bucketCount = 8
  const start = getRangeStart()
  const end = Date.now()
  const step = Math.max((end - start) / bucketCount, 1)

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + step * index
    const bucketEnd = index === bucketCount - 1 ? end + 1 : start + step * (index + 1)
    return {
      start: bucketStart,
      end: bucketEnd,
      label: formatBucketLabel(bucketStart + step / 2),
      inflow: 0,
      outflow: 0
    }
  })
}

const flowSeries = computed(() => {
  const buckets = makeBuckets()
  const start = buckets[0]?.start ?? getRangeStart()

  treasuryTransactions.value
    .filter((item) => item.timestamp >= start)
    .forEach((item) => {
      const bucket = buckets.find((entry) => item.timestamp >= entry.start && item.timestamp < entry.end)
      if (!bucket) return
      if (item.positive) {
        bucket.inflow += item.value
      } else {
        bucket.outflow += item.value
      }
    })

  return buckets.map(({ label, inflow, outflow }) => ({ label, inflow, outflow }))
})

const balanceSeries = computed(() => {
  const flows = flowSeries.value
  const netInRange = flows.reduce((total, item) => total + item.inflow - item.outflow, 0)
  let runningBalance = Math.max(treasuryTotalBalance.value - netInRange, 0)

  return flows.map((item) => {
    runningBalance = Math.max(runningBalance + item.inflow - item.outflow, 0)
    return {
      label: item.label,
      value: runningBalance
    }
  })
})

const balanceChart = computed(() => {
  const rows = balanceSeries.value
  const scale = createScale(rows, ['value'], 0)
  const points = rows.map((row, index) => chartPoint(row, index, rows, 'value', scale))
  const peakPoint = points.reduce((peak, point) => (point.value > peak.value ? point : peak), points[0])
  const activePoint = activeBalanceIndex.value === null ? null : points[activeBalanceIndex.value]
  return {
    points,
    line: smoothPath(points, 0.18),
    area: areaPath(points),
    activePoint,
    peakPoint,
    axis: createAxis(scale, formatChartValue)
  }
})

const flowChart = computed(() => {
  const rows = flowSeries.value
  const scale = createScale(rows, ['inflow', 'outflow'], 0)
  const inflowPoints = rows.map((row, index) => chartPoint(row, index, rows, 'inflow', scale))
  const outflowPoints = rows.map((row, index) => chartPoint(row, index, rows, 'outflow', scale))
  const summaryIndex = activeFlowIndex.value ?? rows.length - 1
  const activePoint = activeFlowIndex.value === null ? null : inflowPoints[activeFlowIndex.value]
  const activeOutflowPoint = activeFlowIndex.value === null ? null : outflowPoints[activeFlowIndex.value]
  return {
    inflowPoints,
    outflowPoints,
    inflowArea: areaPath(inflowPoints),
    outflowArea: areaPath(outflowPoints),
    inflowLine: smoothPath(inflowPoints, 0.2),
    outflowLine: smoothPath(outflowPoints, 0.2),
    activePoint,
    activeOutflowPoint,
    summaryPoint: inflowPoints[summaryIndex],
    summaryOutflowPoint: outflowPoints[summaryIndex],
    axis: createAxis(scale, formatFlow)
  }
})

const setNearestChartPoint = (event) => {
  const points = activeChartMode.value === 'balance'
    ? balanceChart.value.points
    : flowChart.value.inflowPoints
  if (!points.length) return

  const bounds = event.currentTarget.getBoundingClientRect()
  const plotWidth = chartBox.width - chartBox.left - chartBox.right
  const pointerRatio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1)
  const pointerX = chartBox.left + pointerRatio * plotWidth
  const nearestIndex = points.reduce((nearest, point, index) => (
    Math.abs(point.x - pointerX) < Math.abs(points[nearest].x - pointerX) ? index : nearest
  ), 0)

  if (activeChartMode.value === 'balance') {
    activeBalanceIndex.value = nearestIndex
  } else {
    activeFlowIndex.value = nearestIndex
  }
}

const resetChartFocus = () => {
  activeBalanceIndex.value = null
  activeFlowIndex.value = null
}

const chartTooltipX = (point, width = 160) => (
  Math.min(Math.max(point.x - width / 2, chartBox.left), chartBox.width - chartBox.right - width)
)

const chartTooltipY = (point, height = 58) => (
  Math.min(Math.max(point.y - height - 14, chartBox.top), chartBox.height - chartBox.bottom - height)
)

const filteredProposals = computed(() => {
  const keyword = proposalSearchText.value.trim().toLowerCase()
  if (!keyword) return proposalRows.value

  return proposalRows.value.filter((item) => [
    item.id,
    item.status,
    item.age,
    item.title,
    item.author,
    item.asset,
    item.target
  ].some((value) => String(value).toLowerCase().includes(keyword)))
})

const proposalPageCount = computed(() => Math.max(1, Math.ceil(filteredProposals.value.length / PROPOSAL_PAGE_SIZE)))

const paginatedProposals = computed(() => {
  const start = (proposalPage.value - 1) * PROPOSAL_PAGE_SIZE
  return filteredProposals.value.slice(start, start + PROPOSAL_PAGE_SIZE)
})

const proposalPageNumbers = computed(() => (
  Array.from({ length: proposalPageCount.value }, (_, index) => index + 1)
))

const filteredTreasuryTransactions = computed(() => {
  const keyword = transactionSearchText.value.trim().toLowerCase()
  if (!keyword) return treasuryTransactions.value

  return treasuryTransactions.value.filter((item) => [
    item.type,
    item.asset,
    item.amount,
    item.counterpartyLabel,
    item.counterparty,
    item.proposal,
    item.time,
    item.tx
  ].some((value) => String(value).toLowerCase().includes(keyword)))
})

const transactionPageCount = computed(() => Math.max(1, Math.ceil(filteredTreasuryTransactions.value.length / TRANSACTION_PAGE_SIZE)))

const paginatedTreasuryTransactions = computed(() => {
  const start = (transactionPage.value - 1) * TRANSACTION_PAGE_SIZE
  return filteredTreasuryTransactions.value.slice(start, start + TRANSACTION_PAGE_SIZE)
})

const transactionPageNumbers = computed(() => (
  Array.from({ length: transactionPageCount.value }, (_, index) => index + 1)
))

const filteredTreasuryAssets = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return treasuryAssetRows.value.filter((item) => {
    const tabMatches = activeAssetTab.value === 'all' ||
      (activeAssetTab.value === 'admitted' && item.isAdmitted) ||
      (activeAssetTab.value === 'removed' && !item.isAdmitted)

    const textMatches = !keyword || [
      item.symbol,
      item.address,
      item.status,
      item.typeLabel
    ].some((value) => String(value).toLowerCase().includes(keyword))

    return tabMatches && textMatches
  })
})

const assetPageCount = computed(() => Math.max(1, Math.ceil(filteredTreasuryAssets.value.length / ASSET_PAGE_SIZE)))

const paginatedTreasuryAssets = computed(() => {
  const start = (assetPage.value - 1) * ASSET_PAGE_SIZE
  return filteredTreasuryAssets.value.slice(start, start + ASSET_PAGE_SIZE)
})

const assetPageStart = computed(() => {
  if (!filteredTreasuryAssets.value.length) return 0
  return (assetPage.value - 1) * ASSET_PAGE_SIZE + 1
})

const assetPageEnd = computed(() => Math.min(assetPage.value * ASSET_PAGE_SIZE, filteredTreasuryAssets.value.length))

const assetPageNumbers = computed(() => (
  Array.from({ length: assetPageCount.value }, (_, index) => index + 1)
))

const isTreasuryConfigured = computed(() => ethers.isAddress(TREASURY_ADDRESS))

const localNetworkReady = computed(() => chainId.value?.toLowerCase() === PUNKCHAIN_CHAIN_ID)

const walletStatusLabel = computed(() => {
  if (!account.value) return 'Wallet required'
  return localNetworkReady.value ? 'PunkChain ready' : 'Switch required'
})

const selectedAsset = computed(() => (
  treasuryAssets.value.find((item) => item.value === treasuryProposalForm.token) || treasuryAssets.value[0]
))

const selectedAssetBalance = computed(() => {
  const asset = selectedAsset.value
  if (!asset) return '0'
  return `${formatTokenAmount(asset.balance, asset.decimals)} ${asset.symbol}`
})

const treasuryAddressLabel = computed(() => (
  isTreasuryConfigured.value ? shortAddress(TREASURY_ADDRESS) : 'Not configured'
))

const resetTreasuryForm = () => {
  treasuryProposalForm.token = treasuryAssets.value[0]?.value || NATIVE_TOKEN
  treasuryProposalForm.target = ''
  treasuryProposalForm.amount = ''
  treasuryProposalForm.description = ''
}

const showCreateTreasuryModal = async () => {
  isTreasuryModalVisible.value = true
  await fetchTreasuryAssets()
}

const goToTreasuryProposalDetail = (id) => {
  router.push(`/proposal/treasury/${id}`)
}

const shortAddress = (address) => {
  if (!address || !ethers.isAddress(address)) return 'Not configured'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const shortHash = (hash) => {
  if (!hash || typeof hash !== 'string') return 'Not available'
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

const isNativeToken = (token) => token?.toLowerCase() === NATIVE_TOKEN.toLowerCase()

const normalizeAddress = (address) => String(address || '').toLowerCase()

const formatRelativeTime = (timestampSeconds) => {
  const timestamp = Number(timestampSeconds) * 1000
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown time'

  const diff = Date.now() - timestamp
  const absDiff = Math.abs(diff)
  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000]
  ]

  for (const [unit, size] of units) {
    if (absDiff >= size) {
      const value = Math.max(1, Math.round(absDiff / size))
      return diff >= 0 ? `${value} ${unit}${value > 1 ? 's' : ''} ago` : `in ${value} ${unit}${value > 1 ? 's' : ''}`
    }
  }

  return diff >= 0 ? 'just now' : 'soon'
}

const parseStateTimestamp = (value) => {
  if (!value) return Math.floor(Date.now() / 1000)
  const normalized = String(value).replace(' Asia/Shanghai', '+08:00').replace(' ', 'T')
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000)
}

const getAssetMeta = (token) => {
  const normalized = normalizeAddress(token)
  const fromChain = treasuryAssetRows.value.find((item) => normalizeAddress(item.address) === normalized)
  if (fromChain) return fromChain

  const fromDeploy = treasuryDeployedData.assets?.find((item) => normalizeAddress(item.address) === normalized)
  if (fromDeploy) {
    return {
      symbol: fromDeploy.symbol,
      decimals: Number(fromDeploy.decimals || 18),
      mark: fromDeploy.symbol.slice(0, 4).toUpperCase()
    }
  }

  if (isNativeToken(token)) {
    return { symbol: 'PUNK', decimals: 18, mark: 'PUNK' }
  }

  return { symbol: 'Asset', decimals: 18, mark: 'AST' }
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

const getTreasuryProvider = () => new ethers.JsonRpcProvider(TREASURY_RPC_URL)

const getTreasuryReadContract = () => {
  if (!isTreasuryConfigured.value) return null
  const provider = getTreasuryProvider()
  return new ethers.Contract(TREASURY_ADDRESS, TreasuryArtifact.abi, provider)
}

const readEventsWithFallback = async (contract, filter) => {
  const provider = contract.runner?.provider
  if (!provider) return []

  try {
    return await contract.queryFilter(filter, 0, 'latest')
  } catch (error) {
    console.warn('Full event scan failed, retrying recent blocks', error)
    const latestBlock = await provider.getBlockNumber()
    const fromBlock = Math.max(0, latestBlock - 50000)
    return contract.queryFilter(filter, fromBlock, 'latest')
  }
}

const getBlockTimestamp = async (provider, blockNumber, cache) => {
  if (cache.has(blockNumber)) return cache.get(blockNumber)
  const block = await provider.getBlock(blockNumber)
  const timestamp = Number(block?.timestamp || 0)
  cache.set(blockNumber, timestamp)
  return timestamp
}

const getEventIndex = (event) => Number(event.index ?? event.logIndex ?? 0)

const findWithdrawProposal = (token, target, amount, reason) => {
  const normalizedToken = normalizeAddress(token)
  const normalizedTarget = normalizeAddress(target)
  const amountLabel = amount?.toString?.() || String(amount)

  const exact = proposalRows.value.find((proposal) => (
    normalizeAddress(proposal.token) === normalizedToken &&
    normalizeAddress(proposal.target) === normalizedTarget &&
    proposal.amountRaw === amountLabel &&
    proposal.description === reason
  ))
  if (exact) return `Proposal #${exact.id}`

  const byDescription = proposalRows.value.find((proposal) => proposal.description === reason)
  return byDescription ? `Proposal #${byDescription.id}` : 'Withdraw'
}

const getStateProposalFallback = () => {
  if (!treasuryStateData?.proposalId) return []

  const asset = treasuryStateData.asset || getAssetMeta(treasuryStateData.token)
  const decimals = Number(asset.decimals || 18)
  const startTime = parseStateTimestamp(treasuryStateData.startTime)
  const endTime = parseStateTimestamp(treasuryStateData.endTime)
  const state = Number(treasuryStateData.proposalState ?? (treasuryStateData.executed ? 4 : 0))
  let amountRaw = '0'
  try {
    amountRaw = ethers.parseUnits(String(treasuryStateData.amount || '0'), decimals).toString()
  } catch {
    amountRaw = String(treasuryStateData.amount || '0')
  }

  return [{
    id: Number(treasuryStateData.proposalId),
    status: PROPOSAL_STATES[state] || (treasuryStateData.executed ? 'Executed' : 'Pending'),
    age: formatRelativeTime(startTime),
    title: buildTreasuryProposalTitle(amountRaw, decimals, asset.symbol, treasuryStateData.target),
    author: shortAddress(treasuryStateData.proposer),
    proposer: treasuryStateData.proposer,
    token: treasuryStateData.token,
    target: treasuryStateData.target,
    asset: asset.symbol,
    amountRaw,
    amountLabel: `${treasuryStateData.amount} ${asset.symbol}`,
    description: treasuryStateData.description,
    startTime,
    endTime,
    forVotes: ethers.parseUnits(String(treasuryStateData.forVotes || '0'), 18),
    againstVotes: ethers.parseUnits(String(treasuryStateData.againstVotes || '0'), 18)
  }]
}

const getStateTransactionFallback = () => {
  if (!treasuryStateData?.executed || !treasuryStateData?.proposalId) return []

  const asset = treasuryStateData.asset || getAssetMeta(treasuryStateData.token)
  const timestamp = parseStateTimestamp(treasuryStateData.executedAt || treasuryStateData.endTime) * 1000
  const value = Number(treasuryStateData.executedAmount || treasuryStateData.amount || 0)

  return [{
    key: `state-proposal-${treasuryStateData.proposalId}`,
    type: 'Outflow',
    asset: asset.symbol,
    amount: `-${formatCompactNumber(value)} ${asset.symbol}`,
    value,
    counterpartyLabel: 'to',
    counterparty: treasuryStateData.target,
    proposal: `Proposal #${treasuryStateData.proposalId}`,
    time: formatRelativeTime(Math.floor(timestamp / 1000)),
    timestamp,
    blockNumber: 0,
    eventIndex: 0,
    tx: '',
    mark: asset.symbol.slice(0, 4).toUpperCase(),
    positive: false
  }]
}

const fetchTreasuryAssets = async (treasury = getTreasuryReadContract()) => {
  if (!treasury) return

  isLoadingAssets.value = true
  try {
    let tokens = []
    try {
      tokens = await treasury.getAllAssets()
    } catch {
      tokens = await treasury.getAdmittedAssets()
    }

    const rows = await Promise.all(tokens.map(async (token) => {
      const stats = await treasury.getAssetStats(token)
      const isAdmitted = stats.isAdmitted ?? stats[0]
      const symbol = stats.symbol || stats[1]
      const decimals = Number(stats.decimals ?? stats[2])
      const balance = stats.balance ?? stats[3]
      const totalDeposited = stats.totalDeposited ?? stats[4]
      const totalWithdrawn = stats.totalWithdrawn ?? stats[5]
      const isNative = isNativeToken(token)
      return {
        value: token,
        label: `${symbol} - ${shortAddress(token)}`,
        symbol,
        decimals,
        balance,
        address: token,
        mark: symbol.slice(0, 4).toUpperCase(),
        isNative,
        typeLabel: isNative ? 'Native' : 'ERC20',
        isAdmitted,
        status: isAdmitted ? 'Admitted' : 'Removed',
        totalDeposited,
        totalWithdrawn,
        balanceLabel: formatTokenAmount(balance, decimals),
        depositedLabel: formatTokenAmount(totalDeposited, decimals),
        withdrawnLabel: formatTokenAmount(totalWithdrawn, decimals)
      }
    }))

    treasuryAssetRows.value = rows
    const admittedAssets = rows.filter((item) => item.isAdmitted)

    if (admittedAssets.length) {
      treasuryAssets.value = admittedAssets
      if (!admittedAssets.some((item) => item.value === treasuryProposalForm.token)) {
        treasuryProposalForm.token = admittedAssets[0].value
      }
    }
  } catch (err) {
    console.error(err)
    message.error('Failed to load treasury assets')
  } finally {
    isLoadingAssets.value = false
  }
}

const fetchTreasuryProposals = async (treasury = getTreasuryReadContract()) => {
  if (!treasury) return

  isLoadingProposals.value = true
  try {
    const count = Number(await treasury.proposalCount())
    const proposalIds = Array.from({ length: count }, (_, index) => count - index)

    const rows = await Promise.all(proposalIds.map(async (id) => {
      let basic
      let details
      let state

      try {
        [basic, details] = await Promise.all([
          treasury.getProposalBasic(id),
          treasury.getProposalDetails(id)
        ])
        state = Number(basic.state ?? basic[5])
      } catch (error) {
        console.warn(`Proposal helper read failed for #${id}, falling back to public mapping`, error)
        const [proposal, proposalState] = await Promise.all([
          treasury.proposals(id),
          treasury.getProposalState(id).catch(() => null)
        ])
        basic = {
          id: proposal.id ?? proposal[0],
          proposer: proposal.proposer ?? proposal[1],
          token: proposal.token ?? proposal[2],
          target: proposal.target ?? proposal[3],
          description: proposal.description ?? proposal[5],
          state: proposalState
        }
        details = {
          amount: proposal.amount ?? proposal[4],
          startTime: proposal.startTime ?? proposal[6],
          endTime: proposal.endTime ?? proposal[7],
          forVotes: proposal.forVotes ?? proposal[8],
          againstVotes: proposal.againstVotes ?? proposal[9]
        }
        state = proposalState === null ? 0 : Number(proposalState)
      }

      const proposalId = Number(basic.id ?? basic[0])
      const proposer = basic.proposer ?? basic[1]
      const token = basic.token ?? basic[2]
      const target = basic.target ?? basic[3]
      const description = basic.description ?? basic[4]
      const amount = details.amount ?? details[0]
      const startTime = details.startTime ?? details[1]
      const endTime = details.endTime ?? details[2]
      const forVotes = details.forVotes ?? details[3]
      const againstVotes = details.againstVotes ?? details[4]
      const asset = getAssetMeta(token)

      return {
        id: proposalId,
        status: PROPOSAL_STATES[state] || 'Unknown',
        age: formatRelativeTime(startTime),
        title: buildTreasuryProposalTitle(amount, asset.decimals, asset.symbol, target),
        author: shortAddress(proposer),
        proposer,
        token,
        target,
        asset: asset.symbol,
        amountRaw: amount?.toString?.() || String(amount),
        amountLabel: `${formatTokenAmount(amount, asset.decimals)} ${asset.symbol}`,
        description,
        startTime: Number(startTime),
        endTime: Number(endTime),
        forVotes,
        againstVotes
      }
    }))

    proposalRows.value = rows.length ? rows : getStateProposalFallback()
  } catch (err) {
    console.error(err)
    proposalRows.value = getStateProposalFallback()
    message.error('Failed to load treasury proposals')
  } finally {
    isLoadingProposals.value = false
  }
}

const mapTreasuryFlowEvent = async (event, kind, provider, blockCache) => {
  const timestamp = await getBlockTimestamp(provider, event.blockNumber, blockCache)
  const args = event.args || {}
  const positive = kind !== 'Withdraw'
  const token = kind === 'NativeDeposit' ? NATIVE_TOKEN : (args.token ?? args[0])
  const counterparty = kind === 'Withdraw' ? (args.to ?? args[1]) : (args.sender ?? args[1] ?? args[0])
  const amount = kind === 'NativeDeposit' ? (args.amount ?? args[1]) : (args.amount ?? args[2])
  const reason = kind === 'NativeDeposit' ? (args.reason ?? args[2]) : (args.reason ?? args[3])
  const asset = getAssetMeta(token)
  const value = toDisplayNumber(amount, asset.decimals)

  return {
    key: `${event.transactionHash}-${getEventIndex(event)}`,
    type: positive ? 'Inflow' : 'Outflow',
    asset: asset.symbol,
    amount: `${positive ? '+' : '-'}${formatTokenAmount(amount, asset.decimals)} ${asset.symbol}`,
    value,
    counterpartyLabel: positive ? 'from' : 'to',
    counterparty,
    proposal: positive ? (reason || 'Deposit') : findWithdrawProposal(token, counterparty, amount, reason),
    time: formatRelativeTime(timestamp),
    timestamp: timestamp * 1000,
    blockNumber: event.blockNumber,
    eventIndex: getEventIndex(event),
    tx: event.transactionHash,
    mark: asset.mark || asset.symbol.slice(0, 4).toUpperCase(),
    positive
  }
}

const fetchTreasuryTransactions = async (treasury = getTreasuryReadContract()) => {
  if (!treasury) return

  isLoadingTransactions.value = true
  try {
    const provider = treasury.runner?.provider
    const blockCache = new Map()

    const [depositEvents, nativeDepositEvents, withdrawEvents, voteEvents] = await Promise.all([
      readEventsWithFallback(treasury, treasury.filters.Deposit()),
      readEventsWithFallback(treasury, treasury.filters.NativeDeposit()),
      readEventsWithFallback(treasury, treasury.filters.Withdraw()),
      readEventsWithFallback(treasury, treasury.filters.VoteCast())
    ])

    const uniqueVoters = new Set(voteEvents.map((event) => normalizeAddress(event.args?.voter ?? event.args?.[0])))
    voterCount.value = uniqueVoters.size || treasuryDeployedData.voters?.length || 0

    const rows = await Promise.all([
      ...depositEvents.map((event) => mapTreasuryFlowEvent(event, 'Deposit', provider, blockCache)),
      ...nativeDepositEvents.map((event) => mapTreasuryFlowEvent(event, 'NativeDeposit', provider, blockCache)),
      ...withdrawEvents.map((event) => mapTreasuryFlowEvent(event, 'Withdraw', provider, blockCache))
    ])

    const sortedRows = rows
      .sort((a, b) => (b.blockNumber - a.blockNumber) || (b.eventIndex - a.eventIndex))
    treasuryTransactions.value = sortedRows.length ? sortedRows : getStateTransactionFallback()
  } catch (err) {
    console.error(err)
    treasuryTransactions.value = getStateTransactionFallback()
    message.error('Failed to load treasury transactions')
  } finally {
    isLoadingTransactions.value = false
  }
}

const fetchTreasuryDashboard = async () => {
  const treasury = getTreasuryReadContract()
  if (!treasury) return

  await fetchTreasuryAssets(treasury)
  await fetchTreasuryProposals(treasury)
  await fetchTreasuryTransactions(treasury)
}

const setAssetPage = (page) => {
  assetPage.value = Math.min(Math.max(page, 1), assetPageCount.value)
}

const setProposalPage = (page) => {
  proposalPage.value = Math.min(Math.max(page, 1), proposalPageCount.value)
}

const setTransactionPage = (page) => {
  transactionPage.value = Math.min(Math.max(page, 1), transactionPageCount.value)
}

const copyAssetAddress = async (address) => {
  try {
    await navigator.clipboard.writeText(address)
    message.success('Asset address copied')
  } catch {
    message.error('Failed to copy address')
  }
}

const copyTransactionHash = async (hash) => {
  try {
    await navigator.clipboard.writeText(hash)
    message.success('Transaction hash copied')
  } catch {
    message.error('Failed to copy transaction')
  }
}

const getTreasuryWriteContract = async () => {
  if (!isTreasuryConfigured.value) {
    message.error('Treasury contract address is not configured. Set VITE_TREASURY_ADDRESS first.')
    return null
  }

  if (!localNetworkReady.value) {
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

const handleCreateTreasuryProposal = async () => {
  isCreatingTreasuryProposal.value = true
  try {
    if (!ethers.isAddress(treasuryProposalForm.target)) throw new Error('Invalid target address')
    if (!selectedAsset.value) throw new Error('Please select an admitted asset')

    const amount = ethers.parseUnits(
      String(treasuryProposalForm.amount || '0').trim(),
      selectedAsset.value.decimals
    )
    if (amount <= 0n) throw new Error('Amount must be greater than 0')

    const treasury = await getTreasuryWriteContract()
    if (!treasury) return

    const tx = await treasury.propose(
      treasuryProposalForm.token,
      treasuryProposalForm.target,
      amount,
      treasuryProposalForm.description
    )
    await tx.wait()

    message.success('Treasury proposal created successfully')
    isTreasuryModalVisible.value = false
    await fetchTreasuryDashboard()
  } catch (err) {
    console.error(err)
    message.error(`Failed to create treasury proposal: ${err.shortMessage || err.reason || err.message}`)
  } finally {
    isCreatingTreasuryProposal.value = false
  }
}

onMounted(() => {
  fetchTreasuryDashboard()
})

watch([activeAssetTab, searchText], () => {
  assetPage.value = 1
})

watch(proposalSearchText, () => {
  proposalPage.value = 1
})

watch(transactionSearchText, () => {
  transactionPage.value = 1
})

watch(activeChartRange, () => {
  resetChartFocus()
})

watch(assetPageCount, (count) => {
  if (assetPage.value > count) assetPage.value = count
})

watch(proposalPageCount, (count) => {
  if (proposalPage.value > count) proposalPage.value = count
})

watch(transactionPageCount, (count) => {
  if (transactionPage.value > count) transactionPage.value = count
})
</script>

<template>
  <main class="treasury-page">
    <section class="treasury-shell">
      <header class="treasury-heading">
        <p>Treasury</p>
        <h1>Capital flows and governance spending</h1>
      </header>

      <a-modal
        v-model:open="isTreasuryModalVisible"
        title="Create Treasury Proposal"
        :footer="null"
        width="680px"
        :class="'treasury-create-modal'"
        :afterClose="resetTreasuryForm"
      >
        <div class="proposal-context">
          <div class="context-item">
            <WalletOutlined />
            <div>
              <span>Wallet</span>
              <strong>{{ walletStatusLabel }}</strong>
            </div>
          </div>
          <div class="context-item">
            <SafetyCertificateOutlined />
            <div>
              <span>Treasury</span>
              <strong>{{ treasuryAddressLabel }}</strong>
            </div>
          </div>
          <div class="context-item">
            <SwapOutlined />
            <div>
              <span>Available</span>
              <strong>{{ selectedAssetBalance }}</strong>
            </div>
          </div>
        </div>

        <a-alert
          v-if="!isTreasuryConfigured"
          class="treasury-config-alert"
          type="warning"
          show-icon
          message="Treasury contract address is not configured."
          description="Set VITE_TREASURY_ADDRESS to enable on-chain proposal creation."
        />

        <a-form layout="vertical" :model="treasuryProposalForm" @finish="handleCreateTreasuryProposal">
          <a-form-item
            label="Asset"
            name="token"
            :rules="[{ required: true, message: 'Please select an admitted treasury asset' }]"
          >
            <a-select
              v-model:value="treasuryProposalForm.token"
              :loading="isLoadingAssets"
              size="large"
              :options="treasuryAssets"
              placeholder="Select admitted asset"
            />
          </a-form-item>

          <div class="form-grid treasury-form-grid">
            <a-form-item
              label="Target"
              name="target"
              :rules="[{ required: true, message: 'Please provide target address' }]"
            >
              <a-input v-model:value="treasuryProposalForm.target" placeholder="0x..." size="large" />
            </a-form-item>

            <a-form-item
              label="Amount"
              name="amount"
              :rules="[{ required: true, message: 'Please provide transfer amount' }]"
            >
              <a-input
                v-model:value="treasuryProposalForm.amount"
                :placeholder="`0.00 ${selectedAsset?.symbol || 'PUNK'}`"
                size="large"
              />
            </a-form-item>
          </div>

          <a-form-item
            label="Description"
            name="description"
            :rules="[{ required: true, message: 'Please provide proposal description' }]"
          >
            <a-textarea
              v-model:value="treasuryProposalForm.description"
              placeholder="Describe the target, spending purpose, and expected treasury impact."
              :rows="5"
              size="large"
            />
          </a-form-item>

          <div class="proposal-preview">
            <span>Contract call</span>
            <strong>propose(token, target, amount, description)</strong>
          </div>

          <a-form-item style="margin-bottom: 0;">
            <a-button
              type="primary"
              html-type="submit"
              block
              size="large"
              class="submit-btn treasury-submit-btn"
              :disabled="!isTreasuryConfigured"
              :loading="isCreatingTreasuryProposal"
            >
              Create Proposal
            </a-button>
          </a-form-item>
        </a-form>
      </a-modal>

      <div class="treasury-grid">
        <section class="main-column">
          <div class="stats-grid">
            <article v-for="item in stats" :key="item.key" class="metric-card">
              <component :is="item.icon" class="metric-icon" />
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </article>
          </div>

          <section class="chart-panel chart-panel--overview">
            <div class="chart-header">
              <div>
                <h2>Overview</h2>
              </div>
              <div class="chart-controls">
                <div class="mode-tabs" aria-label="Treasury chart type">
                  <button
                    v-for="option in chartModeOptions"
                    :key="option.value"
                    type="button"
                    :class="{ active: activeChartMode === option.value }"
                    @click="activeChartMode = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <div class="range-tabs" aria-label="Treasury chart range">
                  <button
                    v-for="range in chartRanges"
                    :key="`chart-${range}`"
                    type="button"
                    :class="{ active: activeChartRange === range }"
                    @click="activeChartRange = range"
                  >
                    {{ range }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="activeChartMode === 'balance'" class="chart-summary-row">
              <div>
                <span>Total balance</span>
                <strong>{{ formatChartValue(balanceSeries[balanceSeries.length - 1].value) }}</strong>
              </div>
              <div>
                <span>{{ activeChartRange }} net flow</span>
                <strong :class="flowSeries.reduce((total, item) => total + item.inflow - item.outflow, 0) >= 0 ? 'positive-value' : 'negative-value'">
                  {{ formatSignedFlow(flowSeries.reduce((total, item) => total + item.inflow - item.outflow, 0)) }}
                </strong>
              </div>
              <div>
                <span>Peak balance</span>
                <strong>{{ formatChartValue(balanceChart.peakPoint.value) }}</strong>
              </div>
            </div>

            <div v-else class="chart-summary-row chart-summary-row--compact">
              <div>
                <span>Inflows</span>
                <strong>{{ formatFlow(flowChart.summaryPoint.inflow) }}</strong>
              </div>
              <div>
                <span>Outflows</span>
                <strong>{{ formatFlow(flowChart.summaryOutflowPoint.outflow) }}</strong>
              </div>
              <div>
                <span>Net flow</span>
                <strong :class="flowChart.summaryPoint.inflow - flowChart.summaryOutflowPoint.outflow >= 0 ? 'positive-value' : 'negative-value'">
                  {{ formatSignedFlow(flowChart.summaryPoint.inflow - flowChart.summaryOutflowPoint.outflow) }}
                </strong>
              </div>
            </div>

            <div class="svg-chart" :class="activeChartMode === 'balance' ? 'svg-chart--area' : 'svg-chart--lines'" aria-label="Treasury chart">
              <svg :viewBox="`0 0 ${chartBox.width} ${chartBox.height}`" role="img">
                <defs>
                  <linearGradient id="balanceAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#6675ff" stop-opacity="0.38" />
                    <stop offset="48%" stop-color="#6675ff" stop-opacity="0.16" />
                    <stop offset="100%" stop-color="#6675ff" stop-opacity="0" />
                  </linearGradient>
                  <linearGradient id="balanceStrokeGradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stop-color="#7280ff" />
                    <stop offset="52%" stop-color="#5868f2" />
                    <stop offset="100%" stop-color="#7b8cff" />
                  </linearGradient>
                  <linearGradient id="inflowStrokeGradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stop-color="#7280ff" />
                    <stop offset="100%" stop-color="#5868f2" />
                  </linearGradient>
                  <linearGradient id="outflowStrokeGradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stop-color="#22c7a5" />
                    <stop offset="100%" stop-color="#139b7d" />
                  </linearGradient>
                  <linearGradient id="inflowAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#5868f2" stop-opacity="0.2" />
                    <stop offset="58%" stop-color="#5868f2" stop-opacity="0.075" />
                    <stop offset="100%" stop-color="#5868f2" stop-opacity="0" />
                  </linearGradient>
                  <linearGradient id="outflowAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#18a889" stop-opacity="0.18" />
                    <stop offset="58%" stop-color="#18a889" stop-opacity="0.06" />
                    <stop offset="100%" stop-color="#18a889" stop-opacity="0" />
                  </linearGradient>
                  <filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#5868f2" flood-opacity="0.18" />
                  </filter>
                  <filter id="flowGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#3e5cf6" flood-opacity="0.12" />
                  </filter>
                </defs>

                <g v-if="activeChartMode === 'balance'" class="chart-grid">
                  <g v-for="tick in balanceChart.axis" :key="`balance-${tick.label}`">
                    <line :x1="chartBox.left" :x2="chartBox.width - chartBox.right" :y1="tick.y" :y2="tick.y" />
                    <text :x="chartBox.left - 14" :y="tick.y + 4">{{ tick.label }}</text>
                  </g>
                </g>
                <g v-else class="chart-grid">
                  <g v-for="tick in flowChart.axis" :key="`flow-${tick.label}`">
                    <line :x1="chartBox.left" :x2="chartBox.width - chartBox.right" :y1="tick.y" :y2="tick.y" />
                    <text :x="chartBox.left - 14" :y="tick.y + 4">{{ tick.label }}</text>
                  </g>
                </g>

                <template v-if="activeChartMode === 'balance'">
                  <path class="area-fill" :d="balanceChart.area" />
                  <path class="line-path line-path--balance" :d="balanceChart.line" filter="url(#chartGlow)" />
                  <g v-if="balanceChart.activePoint" class="chart-focus">
                    <line
                      :x1="balanceChart.activePoint.x"
                      :x2="balanceChart.activePoint.x"
                      :y1="chartBox.top"
                      :y2="chartBox.height - chartBox.bottom"
                    />
                    <circle :cx="balanceChart.activePoint.x" :cy="balanceChart.activePoint.y" r="7" />
                    <foreignObject :x="chartTooltipX(balanceChart.activePoint)" :y="chartTooltipY(balanceChart.activePoint)" width="160" height="58">
                      <div class="chart-tooltip">
                        <span>{{ balanceChart.activePoint.label }}</span>
                        <strong>{{ formatChartValue(balanceChart.activePoint.value) }}</strong>
                      </div>
                    </foreignObject>
                  </g>
                  <g class="chart-x-axis">
                    <text v-for="point in balanceChart.points" :key="`balance-label-${point.label}`" :x="point.x" :y="chartBox.height - 12">
                      {{ point.label }}
                    </text>
                  </g>
                </template>

                <template v-else>
                  <path class="flow-area flow-area--inflow" :d="flowChart.inflowArea" />
                  <path class="flow-area flow-area--outflow" :d="flowChart.outflowArea" />
                  <path class="line-path line-path--inflow" :d="flowChart.inflowLine" filter="url(#flowGlow)" />
                  <path class="line-path line-path--outflow" :d="flowChart.outflowLine" />
                  <g v-if="flowChart.activePoint && flowChart.activeOutflowPoint" class="chart-focus chart-focus--flow">
                    <line
                      :x1="flowChart.activePoint.x"
                      :x2="flowChart.activePoint.x"
                      :y1="chartBox.top"
                      :y2="chartBox.height - chartBox.bottom"
                    />
                    <circle class="focus-dot--inflow" :cx="flowChart.activePoint.x" :cy="flowChart.activePoint.y" r="6" />
                    <circle class="focus-dot--outflow" :cx="flowChart.activeOutflowPoint.x" :cy="flowChart.activeOutflowPoint.y" r="6" />
                    <foreignObject :x="chartTooltipX(flowChart.activePoint, 190)" :y="chartTooltipY(flowChart.activePoint, 96)" width="190" height="96">
                      <div class="chart-tooltip chart-tooltip--flow">
                        <span>{{ flowChart.activePoint.label }}</span>
                        <strong>{{ formatFlow(flowChart.activePoint.inflow) }} in</strong>
                        <strong>{{ formatFlow(flowChart.activeOutflowPoint.outflow) }} out</strong>
                      </div>
                    </foreignObject>
                  </g>
                  <g class="chart-x-axis">
                    <text v-for="point in flowChart.inflowPoints" :key="`flow-label-${point.label}`" :x="point.x" :y="chartBox.height - 12">
                      {{ point.label }}
                    </text>
                  </g>
                </template>
                <rect
                  class="chart-hover-zone"
                  :x="chartBox.left"
                  :y="chartBox.top"
                  :width="chartBox.width - chartBox.left - chartBox.right"
                  :height="chartBox.height - chartBox.top - chartBox.bottom"
                  @mousemove="setNearestChartPoint"
                  @mouseleave="resetChartFocus"
                />
              </svg>
            </div>

            <div v-if="activeChartMode === 'flow'" class="line-legend">
              <span><i class="legend-dot legend-dot--in"></i>Inflows</span>
              <span><i class="legend-dot legend-dot--out"></i>Outflows</span>
            </div>
          </section>

          <section class="projects-panel">
            <div class="projects-toolbar">
              <h2>Treasury Assets</h2>
              <div class="project-actions">
                <label class="search-box">
                  <SearchOutlined />
                  <input v-model="searchText" type="search" placeholder="Search asset" />
                </label>
                <div class="segment">
                  <button
                    type="button"
                    :class="{ active: activeAssetTab === 'admitted' }"
                    :aria-pressed="activeAssetTab === 'admitted'"
                    @click="activeAssetTab = 'admitted'"
                  >
                    Admitted
                  </button>
                  <button
                    type="button"
                    :class="{ active: activeAssetTab === 'removed' }"
                    :aria-pressed="activeAssetTab === 'removed'"
                    @click="activeAssetTab = 'removed'"
                  >
                    Removed
                  </button>
                  <button
                    type="button"
                    :class="{ active: activeAssetTab === 'all' }"
                    :aria-pressed="activeAssetTab === 'all'"
                    @click="activeAssetTab = 'all'"
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            <div class="project-table">
              <div class="table-row table-row--head">
                <span>Asset</span>
                <span>Address</span>
                <span>Balance</span>
                <span>Deposited</span>
                <span>Withdrawn</span>
                <span>Status</span>
              </div>
              <div v-for="item in paginatedTreasuryAssets" :key="item.address" class="table-row">
                <span class="asset-name">
                  <i class="project-logo">{{ item.mark }}</i>
                  <span>
                    <strong>{{ item.symbol }}</strong>
                    <i :class="['asset-type', item.isNative ? 'asset-type--native' : 'asset-type--erc20']">
                      {{ item.typeLabel }}
                    </i>
                  </span>
                </span>
                <span class="asset-address">
                  <code>{{ shortAddress(item.address) }}</code>
                  <button
                    type="button"
                    :aria-label="`Copy ${item.symbol} address`"
                    @click="copyAssetAddress(item.address)"
                  >
                    <CopyOutlined />
                  </button>
                </span>
                <span>{{ item.balanceLabel }}</span>
                <span>{{ item.depositedLabel }}</span>
                <span>{{ item.withdrawnLabel }}</span>
                <span>
                  <i :class="['asset-status', item.isAdmitted ? 'asset-status--admitted' : 'asset-status--removed']">
                    {{ item.status }}
                  </i>
                </span>
              </div>
              <div v-if="isLoadingAssets && !treasuryAssetRows.length" class="table-empty">
                Loading treasury assets...
              </div>
              <div v-else-if="!filteredTreasuryAssets.length" class="table-empty">
                No treasury assets match this filter.
              </div>
            </div>

            <nav v-if="filteredTreasuryAssets.length" class="asset-pagination" aria-label="Treasury assets pagination">
              <span>
                {{ assetPageStart }}-{{ assetPageEnd }} of {{ filteredTreasuryAssets.length }} assets
              </span>
              <div>
                <button
                  type="button"
                  :disabled="assetPage === 1"
                  aria-label="Previous asset page"
                  @click="setAssetPage(assetPage - 1)"
                >
                  Previous
                </button>
                <button
                  v-for="page in assetPageNumbers"
                  :key="page"
                  type="button"
                  :class="{ active: assetPage === page }"
                  :aria-current="assetPage === page ? 'page' : undefined"
                  @click="setAssetPage(page)"
                >
                  {{ page }}
                </button>
                <button
                  type="button"
                  :disabled="assetPage === assetPageCount"
                  aria-label="Next asset page"
                  @click="setAssetPage(assetPage + 1)"
                >
                  Next
                </button>
              </div>
            </nav>
          </section>
        </section>

        <aside class="side-column">
          <section class="proposal-panel">
            <div class="side-head">
              <h2>Proposals</h2>
              <button class="outline-btn" type="button" @click="showCreateTreasuryModal">
                <PlusOutlined />
                <span>New Proposal</span>
              </button>
            </div>
            <label class="side-search">
              <SearchOutlined />
              <input v-model="proposalSearchText" type="search" placeholder="Search proposals" />
            </label>
            <div class="proposal-list">
              <button
                v-for="item in paginatedProposals"
                :key="item.id"
                type="button"
                class="proposal-card proposal-card--clickable"
                :aria-label="`Open treasury proposal ${item.id}`"
                @click="goToTreasuryProposalDetail(item.id)"
              >
                <div class="proposal-meta">
                  <span class="status-pill" :class="`status-pill--${item.status.toLowerCase()}`">
                    {{ item.status }}
                  </span>
                  <span class="age"><CalendarOutlined /> {{ item.age }}</span>
                </div>
                <h3>{{ item.title }}</h3>
                <p>by {{ item.author }}</p>
              </button>
              <div v-if="isLoadingProposals && !proposalRows.length" class="side-empty">
                Loading treasury proposals...
              </div>
              <div v-else-if="!filteredProposals.length" class="side-empty">
                No proposals match this search.
              </div>
            </div>
            <nav v-if="filteredProposals.length" class="mini-pagination" aria-label="Proposals pagination">
              <span>{{ filteredProposals.length }} proposals</span>
              <div>
                <button
                  type="button"
                  :disabled="proposalPage === 1"
                  aria-label="Previous proposal page"
                  @click="setProposalPage(proposalPage - 1)"
                >
                  Prev
                </button>
                <button
                  v-for="page in proposalPageNumbers"
                  :key="page"
                  type="button"
                  :class="{ active: proposalPage === page }"
                  :aria-current="proposalPage === page ? 'page' : undefined"
                  @click="setProposalPage(page)"
                >
                  {{ page }}
                </button>
                <button
                  type="button"
                  :disabled="proposalPage === proposalPageCount"
                  aria-label="Next proposal page"
                  @click="setProposalPage(proposalPage + 1)"
                >
                  Next
                </button>
              </div>
            </nav>
          </section>

          <section class="activity-panel">
            <div class="activity-head">
              <h2>Treasury Transactions</h2>
              <span>Latest flow</span>
            </div>
            <label class="side-search">
              <SearchOutlined />
              <input v-model="transactionSearchText" type="search" placeholder="Search transactions" />
            </label>
            <div class="activity-list">
              <article v-for="item in paginatedTreasuryTransactions" :key="item.key" class="activity-row">
                <i class="activity-logo">{{ item.mark }}</i>
                <div class="activity-main">
                  <header class="activity-title">
                    <strong>{{ item.asset }}</strong>
                    <span :class="['activity-status', item.positive ? 'inflow' : 'outflow']">
                      {{ item.type }}
                    </span>
                  </header>
                  <div class="activity-route">
                    <p class="activity-address">
                      {{ item.counterpartyLabel }} <code>{{ shortAddress(item.counterparty) }}</code>
                    </p>
                    <span class="activity-source">{{ item.proposal }}</span>
                  </div>
                  <div class="activity-foot">
                    <span>{{ item.time }}</span>
                    <button
                      v-if="item.tx"
                      type="button"
                      :aria-label="`Copy ${item.asset} transaction hash`"
                      @click="copyTransactionHash(item.tx)"
                    >
                      <CopyOutlined />
                      <b>Tx</b>
                      {{ shortHash(item.tx) }}
                    </button>
                    <span v-else class="activity-local-tag">Script state</span>
                  </div>
                </div>
                <div :class="['activity-amount', item.positive ? 'positive' : 'negative']">
                  <RiseOutlined v-if="item.positive" />
                  <FallOutlined v-else />
                  {{ item.amount }}
                </div>
              </article>
              <div v-if="isLoadingTransactions && !treasuryTransactions.length" class="side-empty">
                Loading treasury transactions...
              </div>
              <div v-else-if="!filteredTreasuryTransactions.length" class="side-empty">
                No transactions match this search.
              </div>
            </div>
            <nav v-if="filteredTreasuryTransactions.length" class="mini-pagination" aria-label="Treasury transactions pagination">
              <span>{{ filteredTreasuryTransactions.length }} transactions</span>
              <div>
                <button
                  type="button"
                  :disabled="transactionPage === 1"
                  aria-label="Previous transaction page"
                  @click="setTransactionPage(transactionPage - 1)"
                >
                  Prev
                </button>
                <button
                  v-for="page in transactionPageNumbers"
                  :key="page"
                  type="button"
                  :class="{ active: transactionPage === page }"
                  :aria-current="transactionPage === page ? 'page' : undefined"
                  @click="setTransactionPage(page)"
                >
                  {{ page }}
                </button>
                <button
                  type="button"
                  :disabled="transactionPage === transactionPageCount"
                  aria-label="Next transaction page"
                  @click="setTransactionPage(transactionPage + 1)"
                >
                  Next
                </button>
              </div>
            </nav>
          </section>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.treasury-page {
  width: min(var(--app-page-width), calc(100% - var(--app-page-gutter)));
  min-height: calc(100vh - 73px);
  padding: 0;
  box-sizing: border-box;
  color: var(--app-text);
  background:
    radial-gradient(circle at 18% 8%, rgba(88, 104, 242, 0.14), transparent 28%),
    radial-gradient(circle at 88% 20%, rgba(20, 184, 166, 0.055), transparent 24%),
    linear-gradient(135deg, rgba(239, 245, 255, 0.96) 0%, rgba(248, 251, 255, 0.97) 46%, rgba(245, 250, 250, 0.94) 100%);
  border: 1px solid var(--app-border);
  border-top: 0;
  border-radius: 0 0 24px 24px;
  box-shadow: var(--app-shadow);
  overflow: hidden;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.treasury-shell {
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.treasury-heading {
  padding: 28px 28px 0;
  margin-bottom: 22px;
}

.ghost-btn,
.outline-btn,
.segment button {
  font: inherit;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.ghost-btn:hover,
.outline-btn:hover {
  border-color: #9fb0d6;
  background: #f7faff;
}

.treasury-heading p,
.section-head p {
  margin: 0 0 4px;
  color: var(--app-muted);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.treasury-heading h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.15;
  letter-spacing: 0;
  font-weight: 900;
}

.treasury-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 410px;
  gap: 20px;
  padding: 0 28px 28px;
}

.main-column,
.side-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

@media (min-width: 1161px) {
  .treasury-grid {
    grid-template-areas:
      "stats proposals"
      "chart proposals"
      "assets transactions";
    grid-template-rows: auto auto auto;
    align-items: stretch;
  }

  .main-column,
  .side-column {
    display: contents;
  }

  .stats-grid {
    grid-area: stats;
  }

  .chart-panel--overview {
    grid-area: chart;
  }

  .projects-panel {
    grid-area: assets;
  }

  .proposal-panel {
    grid-area: proposals;
  }

  .activity-panel {
    grid-area: transactions;
  }

  .proposal-panel,
  .activity-panel {
    display: flex;
    flex-direction: column;
  }

  .proposal-panel .mini-pagination,
  .activity-panel .mini-pagination {
    margin-top: auto;
    padding-top: 14px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metric-card,
.chart-panel,
.projects-panel,
.proposal-panel,
.activity-panel {
  border: 1px solid rgba(212, 223, 238, 0.92);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--app-shadow-soft);
  backdrop-filter: blur(16px);
}

.metric-card {
  min-height: 118px;
  padding: 18px;
  border-radius: 17px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgba(93, 122, 255, 0.18), transparent 58%);
  pointer-events: none;
}

.metric-icon {
  position: relative;
  z-index: 1;
  color: #4f6df5;
  font-size: 21px;
  margin-bottom: 16px;
}

.metric-card strong,
.metric-card span {
  position: relative;
  z-index: 1;
  display: block;
}

.metric-card strong {
  font-size: 23px;
  font-weight: 800;
  line-height: 1.15;
}

.metric-card span {
  margin-top: 6px;
  color: #6a7589;
  font-size: 13px;
  font-weight: 600;
}

.chart-panel {
  padding: 22px;
  border-radius: 22px;
}

.section-head,
.side-head,
.projects-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0;
}

.ghost-btn,
.outline-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.72);
  color: #44506a;
  font-weight: 800;
}

.outline-btn {
  color: #445fe8;
  border-color: rgba(79, 109, 245, 0.34);
}

:global(.treasury-create-modal .ant-modal-content) {
  border-radius: 18px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(212, 223, 238, 0.92);
  box-shadow: 0 28px 70px rgba(29, 42, 72, 0.22);
}

:global(.treasury-create-modal .ant-modal-header) {
  padding: 22px 24px 16px;
  margin: 0;
  border-bottom: 1px solid #e6edf6;
  background: linear-gradient(135deg, #fbfdff, #f2f6ff);
}

:global(.treasury-create-modal .ant-modal-title) {
  color: var(--app-text);
  font-size: 21px;
  font-weight: 900;
  letter-spacing: 0;
}

:global(.treasury-create-modal .ant-modal-body) {
  padding: 24px;
  background:
    radial-gradient(circle at 90% 2%, rgba(88, 104, 242, 0.1), transparent 24%),
    #ffffff;
}

:global(.treasury-create-modal .ant-form-item-label > label) {
  color: #344057;
  font-weight: 850;
}

:global(.treasury-create-modal .ant-input),
:global(.treasury-create-modal .ant-input-number),
:global(.treasury-create-modal .ant-select-selector),
:global(.treasury-create-modal .ant-input-affix-wrapper) {
  border-radius: 12px;
}

.proposal-context {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.context-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 14px;
  border: 1px solid #e2e9f4;
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.92);
}

.context-item > span,
.context-item > .anticon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  color: #536df6;
  background: #eef2ff;
  font-size: 17px;
}

.context-item span,
.context-item strong {
  display: block;
}

.context-item div span {
  color: #718096;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.context-item strong {
  min-width: 0;
  margin-top: 3px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.treasury-config-alert {
  margin-bottom: 18px;
  border-radius: 12px;
}

.treasury-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(180px, 0.65fr);
  gap: 16px;
}

.proposal-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: -2px 0 18px;
  padding: 12px 14px;
  border: 1px dashed #cbd8ee;
  border-radius: 14px;
  background: #fbfdff;
}

.proposal-preview span {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.proposal-preview strong {
  color: #2f3a50;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-align: right;
}

.treasury-submit-btn {
  height: 48px;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, var(--app-primary), #775cf5);
  box-shadow: 0 13px 26px rgba(88, 104, 242, 0.24);
  font-size: 16px;
  font-weight: 900;
}

.treasury-submit-btn:hover {
  background: linear-gradient(135deg, var(--app-primary-dark), #6248e4);
}

.chart-panel--overview {
  min-width: 0;
  padding: 24px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.chart-header p {
  margin: 0 0 4px;
  color: var(--app-muted);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chart-header h2 {
  margin: 0;
  color: #182237;
  font-size: 24px;
  font-weight: 950;
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode-tabs,
.range-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid #dfe7f3;
  border-radius: 13px;
  background: #f7faff;
}

.mode-tabs button,
.range-tabs button {
  min-width: 42px;
  height: 31px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #7b879b;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  transition: background-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.mode-tabs button {
  min-width: 74px;
}

.mode-tabs button:hover,
.mode-tabs button.active,
.range-tabs button:hover,
.range-tabs button.active {
  color: #536df6;
  background: #eef2ff;
  box-shadow: 0 8px 18px rgba(88, 104, 242, 0.14);
}

.chart-summary-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.chart-summary-row div {
  min-width: 0;
  padding: 13px 14px;
  border: 1px solid #e5edf7;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffffff, #f8fbff);
}

.chart-summary-row span,
.chart-summary-row strong {
  display: block;
}

.chart-summary-row span {
  color: #718096;
  font-size: 12px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chart-summary-row strong {
  margin-top: 4px;
  color: #1f2937;
  font-size: 18px;
  font-weight: 950;
}

.chart-summary-row--compact strong {
  font-size: 16px;
}

.positive-value {
  color: #129872 !important;
}

.negative-value {
  color: #b7791f !important;
}

.svg-chart {
  position: relative;
  width: 100%;
  min-width: 0;
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid #edf2f8;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(249, 251, 255, 0.9)),
    #ffffff;
}

.svg-chart svg {
  display: block;
  width: 100%;
  height: auto;
  min-height: 278px;
}

.chart-grid line {
  stroke: rgba(224, 232, 246, 0.78);
  stroke-width: 1;
}

.chart-grid text {
  fill: #7b879b;
  font-size: 12px;
  font-weight: 800;
  text-anchor: end;
}

.area-fill {
  fill: url(#balanceAreaGradient);
}

.flow-area {
  pointer-events: none;
}

.flow-area--inflow {
  fill: url(#inflowAreaGradient);
}

.flow-area--outflow {
  fill: url(#outflowAreaGradient);
}

.line-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.line-path--balance {
  stroke: url(#balanceStrokeGradient);
  stroke-width: 3.4;
}

.line-path--inflow {
  stroke: url(#inflowStrokeGradient);
}

.line-path--outflow {
  stroke: url(#outflowStrokeGradient);
}

.chart-focus line {
  stroke: #9aa7d9;
  stroke-dasharray: 5 6;
  stroke-width: 1.4;
}

.chart-focus circle {
  fill: #6574f8;
  stroke: #ffffff;
  stroke-width: 5.5;
}

.chart-focus--flow .focus-dot--inflow {
  fill: #5868f2;
}

.chart-focus--flow .focus-dot--outflow {
  fill: #18a889;
}

.chart-tooltip {
  width: 136px;
  padding: 10px 12px;
  border: 1px solid #e2e9f4;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: none;
  color: #182237;
  text-align: center;
}

.chart-tooltip span,
.chart-tooltip strong {
  display: block;
}

.chart-tooltip span {
  color: #8792a5;
  font-size: 11px;
  font-weight: 800;
}

.chart-tooltip strong {
  margin-top: 3px;
  font-size: 15px;
  font-weight: 950;
}

.chart-tooltip--flow {
  width: 166px;
  text-align: left;
}

.chart-tooltip--flow strong:nth-of-type(1) {
  color: #5868f2;
}

.chart-tooltip--flow strong:nth-of-type(2) {
  color: #139b7d;
}

.chart-hover-zone {
  fill: transparent;
  cursor: default;
  pointer-events: all;
}

.chart-x-axis text {
  fill: #8a95a8;
  font-size: 12px;
  font-weight: 800;
  text-anchor: middle;
}

.line-legend {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-top: 12px;
  color: #44506a;
  font-size: 14px;
  font-weight: 800;
}

.line-legend span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 11px;
  height: 11px;
  border-radius: 4px;
}

.legend-dot--in { background: #5868f2; }
.legend-dot--out { background: #18a889; }

.projects-panel,
.proposal-panel,
.activity-panel {
  border-radius: 20px;
  overflow: hidden;
}

.projects-panel {
  padding: 0;
}

.projects-toolbar {
  padding: 18px 18px 14px;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #cbd8ee;
  border-radius: 12px;
  color: #6f7c92;
  background: #ffffff;
}

.search-box input {
  width: 130px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #182237;
  font: inherit;
  font-weight: 600;
}

.segment {
  display: inline-flex;
  box-sizing: border-box;
  padding: 4px;
  border-radius: 13px;
  background: #edf2f8;
}

.segment button {
  min-width: 78px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #66738b;
  font-weight: 800;
  cursor: pointer;
}

.segment button.active {
  color: #182237;
  background: #ffffff;
  box-shadow: 0 5px 14px rgba(54, 70, 105, 0.1);
}

.project-table {
  width: 100%;
  overflow-x: auto;
  border-top: 1px solid rgba(218, 227, 240, 0.86);
}

.table-row {
  display: grid;
  grid-template-columns: minmax(190px, 1.08fr) minmax(178px, 1.04fr) minmax(104px, 0.64fr) minmax(118px, 0.74fr) minmax(118px, 0.74fr) minmax(112px, 0.64fr);
  min-width: 900px;
  align-items: center;
  min-height: 68px;
  padding: 0 18px;
  color: #44506a;
  font-size: 14px;
  font-weight: 700;
  column-gap: 14px;
}

.table-row:nth-child(odd):not(.table-row--head) {
  background: rgba(238, 243, 250, 0.62);
}

.table-row:not(.table-row--head) {
  transition: background 180ms ease;
}

.table-row:not(.table-row--head):hover {
  background: rgba(228, 237, 251, 0.9);
}

.table-row--head {
  min-height: 42px;
  color: #697690;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgba(231, 237, 247, 0.75);
}

.asset-name {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #182237;
  min-width: 0;
}

.asset-name > span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.asset-name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 950;
}

.asset-type {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.asset-type--native {
  color: #3056d7;
  border: 1px solid rgba(85, 117, 245, 0.22);
  background: #e8edff;
}

.asset-type--erc20 {
  color: #586579;
  border: 1px solid rgba(130, 145, 168, 0.22);
  background: #eef3f8;
}

.project-logo,
.activity-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #ffffff;
  background: #131b2e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
}

.project-logo {
  width: 33px;
  height: 33px;
  border-radius: 11px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14), 0 8px 18px rgba(19, 27, 46, 0.16);
}

.asset-address {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.asset-address code {
  color: #6a7589;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
}

.asset-address button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1px solid #d5e0f0;
  border-radius: 8px;
  color: #5b6bf2;
  background: #ffffff;
  cursor: pointer;
  transition: border 180ms ease, background 180ms ease, color 180ms ease;
}

.asset-address button:hover {
  border-color: rgba(91, 107, 242, 0.34);
  color: #4254df;
  background: #f1f4ff;
}

.asset-status {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 27px;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.asset-status--admitted {
  color: #12805c;
  border-color: rgba(30, 175, 121, 0.2);
  background: #dcf8eb;
}

.asset-status--removed {
  color: #8b5a25;
  border-color: rgba(214, 145, 53, 0.24);
  background: #fff2db;
}

.table-empty {
  min-width: 900px;
  padding: 28px 18px 30px;
  color: #718096;
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.74), rgba(255, 255, 255, 0.92));
}

.asset-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px 16px;
  border-top: 1px solid rgba(218, 227, 240, 0.86);
  color: #6a7589;
  font-size: 13px;
  font-weight: 800;
}

.asset-pagination div {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.asset-pagination button {
  min-width: 34px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid #d8e2f1;
  border-radius: 10px;
  color: #536079;
  background: #ffffff;
  font-weight: 900;
  cursor: pointer;
  transition: border 180ms ease, background 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.asset-pagination button:hover:not(:disabled),
.asset-pagination button.active {
  color: #4f62ef;
  border-color: rgba(79, 98, 239, 0.34);
  background: #f1f4ff;
  box-shadow: 0 7px 16px rgba(79, 98, 239, 0.12);
}

.asset-pagination button:disabled {
  color: #a5afbf;
  cursor: not-allowed;
  background: #f5f7fb;
}

.proposal-panel {
  padding: 22px;
}

.side-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  margin-top: 16px;
  padding: 0 11px;
  border: 1px solid #d8e2f1;
  border-radius: 12px;
  color: #718096;
  background: #ffffff;
}

.side-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: #182237;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 750;
}

.proposal-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.proposal-card {
  width: 100%;
  padding: 17px;
  border: 1px solid #e2e9f4;
  border-radius: 16px;
  background: linear-gradient(145deg, #ffffff, #eff4ff);
  box-shadow: 0 10px 24px rgba(66, 82, 118, 0.08);
  color: inherit;
  font: inherit;
  text-align: left;
}

.proposal-card--clickable {
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease;
}

.proposal-card--clickable:hover,
.proposal-card--clickable:focus-visible {
  border-color: rgba(83, 109, 246, 0.34);
  background: linear-gradient(145deg, #ffffff, #f4f7ff);
  outline: none;
}

.proposal-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
}

.status-pill,
.age {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #68758d;
  font-size: 12px;
  font-weight: 800;
}

.status-pill {
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #ffffff;
}

.status-pill--succeeded {
  color: #16a34a;
  border-color: #bbf7d0;
}

.status-pill--canceled {
  color: #6b7280;
  border-color: #d1d5db;
}

.status-pill--defeated {
  color: #dc2626;
  border-color: #fecaca;
}

.status-pill--active {
  color: #4f46e5;
  border-color: #c7d2fe;
}

.status-pill--executed {
  color: #0891b2;
  border-color: #a5f3fc;
}

.status-pill--pending {
  color: #d97706;
  border-color: #fde68a;
}

.proposal-card h3 {
  margin: 0;
  color: #182237;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proposal-card p {
  margin: 8px 0 0;
  color: #66738b;
  font-size: 13px;
  font-weight: 700;
}

.side-empty {
  padding: 18px 12px;
  border: 1px dashed #d8e2f1;
  border-radius: 14px;
  color: #718096;
  background: #f8fbff;
  font-size: 13px;
  font-weight: 850;
  text-align: center;
}

.mini-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  color: #718096;
  font-size: 12px;
  font-weight: 850;
}

.mini-pagination div {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mini-pagination button {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #d8e2f1;
  border-radius: 9px;
  color: #536079;
  background: #ffffff;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition: border 180ms ease, background 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.mini-pagination button:hover:not(:disabled),
.mini-pagination button.active {
  color: #4f62ef;
  border-color: rgba(79, 98, 239, 0.34);
  background: #f1f4ff;
  box-shadow: 0 6px 14px rgba(79, 98, 239, 0.11);
}

.mini-pagination button:disabled {
  color: #a5afbf;
  cursor: not-allowed;
  background: #f5f7fb;
}

.activity-panel {
  padding: 22px;
}

.activity-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.activity-head span {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  color: #5d6a83;
  background: #eef3fa;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.activity-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(222, 231, 244, 0.92);
  border-radius: 18px;
  background: rgba(248, 251, 255, 0.76);
  transition: border 180ms ease, background 180ms ease;
}

.activity-row:hover {
  border-color: rgba(91, 107, 242, 0.24);
  background: #ffffff;
}

.activity-logo {
  width: 46px;
  height: 46px;
  border-radius: 16px;
}

.activity-main {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.activity-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 26px;
}

.activity-title strong {
  color: #273249;
  font-size: 18px;
  font-weight: 950;
  line-height: 1;
}

.activity-route {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  white-space: nowrap;
}

.activity-address {
  margin: 0;
  color: #697690;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
  white-space: nowrap;
}

.activity-address code {
  color: #697690;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  font-weight: 950;
}

.activity-source {
  display: inline-flex;
  align-items: center;
  width: max-content;
  padding: 3px 9px 4px;
  border-radius: 999px;
  color: #536df6;
  background: #eef2ff;
  font-size: 12px;
  font-weight: 900;
}

.activity-status {
  display: inline-flex;
  align-items: center;
  width: max-content;
  padding: 4px 10px 5px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.activity-status.inflow {
  color: #16875f;
  background: #dcf8eb;
}

.activity-status.outflow {
  color: #b7791f;
  background: #fff2db;
}

.activity-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #8792a6;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.activity-foot button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #d8e2f1;
  border-radius: 10px;
  color: #536df6;
  background: #ffffff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
  transition: border 180ms ease, background 180ms ease;
}

.activity-foot button b {
  color: #3f56f0;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 11px;
  font-weight: 950;
}

.activity-foot button:hover {
  border-color: rgba(83, 109, 246, 0.34);
  background: #f3f6ff;
}

.activity-local-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d8e2f1;
  border-radius: 10px;
  color: #697690;
  background: #ffffff;
  font-size: 12px;
  font-weight: 900;
}

.activity-amount {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-top: 3px;
  font-size: 17px;
  font-weight: 900;
  white-space: nowrap;
}

.activity-amount.positive { color: #13996b; }
.activity-amount.negative { color: #b7791f; }

@media (max-width: 1160px) {
  .treasury-grid {
    grid-template-columns: 1fr;
  }
  .side-column {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
  }
}

@media (max-width: 860px) {
  .treasury-shell {
    padding: 16px;
    border-radius: 22px;
  }
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .chart-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .chart-controls {
    width: 100%;
    justify-content: stretch;
  }
  .mode-tabs,
  .range-tabs {
    width: 100%;
    justify-content: space-between;
  }
  .mode-tabs button,
  .range-tabs button {
    flex: 1;
  }
  .chart-summary-row {
    grid-template-columns: 1fr;
  }
  .side-column {
    display: flex;
  }
  .projects-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .project-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .asset-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .asset-pagination div {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (max-width: 560px) {
  .treasury-page {
    padding: 8px;
  }
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .section-head,
  .side-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .chart-panel {
    padding: 18px 14px;
  }
  .chart-panel--overview {
    padding: 16px;
  }
  .chart-header h2 {
    font-size: 20px;
  }
  .svg-chart {
    overflow-x: auto;
  }
  .svg-chart svg {
    min-width: 620px;
  }
  .line-legend {
    gap: 16px;
    font-size: 12px;
  }
  .search-box {
    width: 100%;
  }
  .search-box input {
    width: 100%;
  }
  .segment {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
  }
  .segment button {
    flex: 1;
    min-width: 0;
    padding: 0 4px;
    font-size: 10px;
  }
  .activity-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .activity-row {
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 10px;
  }
  .activity-logo {
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }
  .activity-title {
    flex-wrap: wrap;
  }
  .activity-source {
    font-size: 11px;
  }
  .activity-foot button {
    max-width: 100%;
    font-size: 10px;
  }
  .mini-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .mini-pagination div {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ghost-btn,
  .outline-btn,
  .segment button {
    transition: none;
  }
}
</style>
