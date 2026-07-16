<template>
  <div class="proposals-container">
    <div class="stats-header governance-summary">
      <div class="stat-items">
        <div class="stat-box">
          <div class="stat-label">Governance Type</div>
          <div class="stat-value compact">{{ activeGovernanceLabel }}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Parameter Proposals</div>
          <div class="stat-value">{{ parameterTotal }}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Upgrade Proposals</div>
          <div class="stat-value">{{ upgradeTotal }}</div>
        </div>
        <div class="stat-box last-stat">
          <div class="stat-label">Network</div>
          <div class="stat-value compact">{{ activeNetworkLabel }}</div>
        </div>
      </div>
    </div>

    <div class="governance-switch">
      <a-segmented
        v-model:value="activeGovernance"
        :options="governanceOptions"
        size="large"
      />
    </div>

    <div class="filter-bar">
      <div class="search-wrap">
        <a-input v-model:value="searchText" :placeholder="searchPlaceholder" class="search-input">
          <template #prefix>
            <SearchOutlined style="color: rgba(0,0,0,.25)" />
          </template>
        </a-input>
      </div>

      <div class="actions-wrap">
        <div class="select-group">
          <span class="select-label">Filter</span>
          <a-select v-model:value="filterValue" class="custom-select" :bordered="false">
            <a-select-option value="all">All Proposals</a-select-option>
            <a-select-option value="active">Active</a-select-option>
            <a-select-option value="succeeded">Succeeded</a-select-option>
            <a-select-option value="executed">Executed</a-select-option>
          </a-select>
        </div>

        <div class="split-line"></div>

        <div class="select-group">
          <span class="select-label">Sort By</span>
          <a-select v-model:value="sortValue" class="custom-select" :bordered="false">
            <a-select-option value="desc">Newest</a-select-option>
            <a-select-option value="asc">Oldest</a-select-option>
          </a-select>
        </div>

        <a-button type="primary" class="new-proposal-btn" @click="showCreateModal">
          {{ createButtonLabel }} <PlusOutlined />
        </a-button>
      </div>
    </div>

    <a-modal
      v-model:open="isParameterModalVisible"
      title="Create Parameter Upgrade Proposal"
      :footer="null"
      width="600px"
      :class="'custom-create-modal'"
      :afterClose="resetParameterForm"
    >
      <div class="create-modal-hero create-modal-hero--parameter">
        <div class="create-modal-hero__icon">
          <SettingOutlined />
        </div>
        <div class="create-modal-hero__copy">
          <span>Parameter Governance</span>
          <strong>Submit a parameter value change for token-weighted voting.</strong>
        </div>
        <div class="create-modal-hero__meta">
          <span>Registry</span>
          <strong>{{ shortAddress(parameterDeployedData.paramRegistry) }}</strong>
        </div>
      </div>

      <a-form class="create-proposal-form" layout="vertical" :model="parameterForm" @finish="handleCreateParameterProposal">
        <div class="form-grid">
          <a-form-item label="Parameter Name" name="name" :rules="[{ required: true, message: 'Please provide parameter name' }]">
            <a-input v-model:value="parameterForm.name" placeholder="e.g. minPowGas" size="large" />
          </a-form-item>

          <a-form-item label="Category" name="category" :rules="[{ required: true, message: 'Please provide category' }]">
            <a-input v-model:value="parameterForm.category" placeholder="e.g. execution" size="large" />
          </a-form-item>
        </div>

        <a-form-item label="New Value" name="newValue" :rules="[{ required: true, message: 'Please provide new value' }]">
          <a-input v-model:value="parameterForm.newValue" placeholder="provide new value (e.g. 2000000)" size="large" />
        </a-form-item>

        <a-form-item label="Description" name="description" :rules="[{ required: true, message: 'Please provide description' }]">
          <a-textarea v-model:value="parameterForm.description" placeholder="Describe why this parameter should change." :rows="5" size="large" />
        </a-form-item>

        <div class="contract-preview">
          <span>Contract call</span>
          <strong>proposeParameterChange(parameterId, newValue, description)</strong>
        </div>

        <a-form-item style="margin-bottom: 0;">
          <a-button type="primary" html-type="submit" block size="large" class="submit-btn" :loading="isCreating">
            Create Proposal
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="isUpgradeModalVisible"
      title="Create Contract Upgrade Proposal"
      :footer="null"
      width="720px"
      :class="'custom-create-modal'"
      :afterClose="resetUpgradeForm"
    >
      <div class="create-modal-hero create-modal-hero--upgrade">
        <div class="create-modal-hero__icon">
          <CodeOutlined />
        </div>
        <div class="create-modal-hero__copy">
          <span>Contract Governance</span>
          <strong>Prepare an implementation upgrade and optional migration calldata.</strong>
        </div>
        <div class="create-modal-hero__meta">
          <span>Governance</span>
          <strong>{{ shortAddress(upgradeDeployedData.upgradeGovernance) }}</strong>
        </div>
      </div>

      <a-form class="create-proposal-form" layout="vertical" :model="upgradeForm" @finish="handleCreateUpgradeProposal">
        <a-alert
          class="upgrade-alert"
          type="info"
          show-icon
          message="Use a wallet with governance tokens on PunkChain."
        />

        <div class="network-flow">
          <div class="network-flow__header">
            <div>
              <div class="network-flow__title">PunkChain deployment flow</div>
              <div class="network-flow__desc">
                MetaMask can switch to PunkChain after the network is added. Add it manually if your wallet has not stored it yet.
              </div>
            </div>
            <a-tag :color="localNetworkReady ? 'green' : 'orange'" class="network-flow__tag">
              {{ walletNetworkLabel }}
            </a-tag>
          </div>

          <div class="network-flow__steps">
            <div :class="['network-flow__step', { 'is-ready': localNetworkReady }]">
              <span class="network-flow__index">1</span>
              <div>
                <div class="network-flow__step-title">Switch to PunkChain</div>
                <div class="network-flow__step-desc">If MetaMask has not added PunkChain, use the manual settings below.</div>
              </div>
            </div>
            <div class="network-flow__step">
              <span class="network-flow__index">2</span>
              <div>
                <div class="network-flow__step-title">Deploy implementation</div>
                <div class="network-flow__step-desc">MetaMask opens a deployment transaction on PunkChain.</div>
              </div>
            </div>
            <div class="network-flow__step">
              <span class="network-flow__index">3</span>
              <div>
                <div class="network-flow__step-title">Create proposal</div>
                <div class="network-flow__step-desc">Submit the upgrade proposal to PunkChain UpgradeGovernance.</div>
              </div>
            </div>
          </div>

          <a-button
            class="prepare-network-btn"
            :loading="isPreparingLocalNetwork"
            @click="prepareLocalNetwork"
          >
            {{ localNetworkReady ? 'PunkChain Ready' : 'Switch to PunkChain' }}
          </a-button>

          <div v-if="!localNetworkReady" class="manual-network">
            <div class="manual-network__title">Manual network settings</div>
            <div class="manual-network__grid">
              <span>Network Name</span><strong>PunkChain</strong>
              <span>RPC URL</span><strong>http://47.243.174.71:36054</strong>
              <span>Chain ID</span><strong>20260418</strong>
              <span>Currency Symbol</span><strong>PUNK</strong>
            </div>
          </div>
        </div>

        <div class="form-grid">
          <a-form-item label="Proxy" name="proxy" :rules="[{ required: true, message: 'Please select or enter proxy address' }]">
            <a-select
              v-model:value="upgradeForm.proxy"
              size="large"
              show-search
              :options="registeredProxyOptions"
              placeholder="Registered proxy address"
            />
          </a-form-item>

          <a-form-item label="New Implementation" name="newImplementation" :rules="[{ required: true, message: 'Please provide new implementation address' }]">
            <a-input v-model:value="upgradeForm.newImplementation" placeholder="0x..." size="large" />
          </a-form-item>
        </div>

        <div class="implementation-tools">
          <a-button class="tool-btn" :loading="isDeployingImplementation" @click="deployV2Implementation">
            <ToolOutlined />
            Deploy New V2 Implementation
          </a-button>
          <a-button class="tool-btn" @click="fillDeployedImplementation">
            <SafetyCertificateOutlined />
            Use deployed.json Implementation
          </a-button>
        </div>

        <div class="form-grid">
          <a-form-item label="Call Data Mode">
            <a-select v-model:value="upgradeForm.callDataMode" size="large" @change="syncUpgradeCallData">
              <a-select-option value="none">No migration call</a-select-option>
              <a-select-option value="initializeV2">initializeV2(uint256)</a-select-option>
              <a-select-option value="custom">Custom calldata</a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item v-if="upgradeForm.callDataMode === 'initializeV2'" label="Initial Multiplier">
            <a-input-number
              v-model:value="upgradeForm.multiplier"
              size="large"
              :min="0"
              style="width: 100%;"
              @change="syncUpgradeCallData"
            />
          </a-form-item>
        </div>

        <a-form-item label="Call Data">
          <a-textarea
            v-model:value="upgradeForm.callData"
            :disabled="upgradeForm.callDataMode !== 'custom'"
            placeholder="0x"
            :rows="3"
            size="large"
          />
        </a-form-item>

        <a-form-item label="Description" name="description" :rules="[{ required: true, message: 'Please provide description' }]">
          <a-textarea v-model:value="upgradeForm.description" placeholder="Describe the implementation change and migration intent." :rows="5" size="large" />
        </a-form-item>

        <div class="contract-preview">
          <span>Contract call</span>
          <strong>proposeUpgrade(proxy, newImplementation, callData, description)</strong>
        </div>

        <a-form-item style="margin-bottom: 0;">
          <a-button type="primary" html-type="submit" block size="large" class="submit-btn" :loading="isCreating">
            Create Proposal
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-table
      :columns="activeColumns"
      :data-source="filteredData"
      :loading="isLoadingTable"
      :pagination="paginationConfig"
      class="custom-table"
      :rowClassName="() => 'custom-table-row'"
      :customRow="(record) => ({
        onClick: () => goToDetail(record.key)
      })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'proposal'">
          <div class="proposal-title" @click.stop="goToDetail(record.key)">
            <span>{{ record.proposal }}</span>
            <ArrowRightOutlined class="link-icon" />
          </div>
        </template>

        <template v-else-if="column.key === 'state'">
          <div :class="['state-tag', record.state.toLowerCase()]">
            <span class="dot"></span> {{ record.state }}
          </div>
        </template>

        <template v-else-if="column.key === 'proxy' || column.key === 'implementation'">
          <span class="mono-address">{{ record[column.key] }}</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ethers } from 'ethers'
import ParameterRegistryArtifact from '../../../artifacts/contracts/ParameterRegistry.sol/ParameterRegistry.json'
import UpgradeGovernanceArtifact from '../../../artifacts/contracts/UpgradeGovernance.sol/UpgradeGovernance.json'
import UpgradeableCounterV2Artifact from '../../../artifacts/contracts/mocks/UpgradeableCounterV2.sol/UpgradeableCounterV2.json'
import parameterDeployedData from '../../../scripts/upgrade_process/deployed.json'
import upgradeDeployedData from '../../../scripts/contract_upgrade_process/deployed.json'
import { useWallet } from '../composables/useWallet'
import {
  SearchOutlined,
  PlusOutlined,
  ArrowRightOutlined,
  CodeOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined
} from '@ant-design/icons-vue'

const router = useRouter()
const { chainId, connect, getSigner } = useWallet()

const PARAMETER_RPC_URL = 'http://47.243.174.71:36054'
const UPGRADE_RPC_URL = 'http://47.243.174.71:36054'
const PUNKCHAIN_CHAIN_ID = '0x1352642'
const PK_DEPLOYER = 'eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f'

const PUNKCHAIN_NETWORK = {
  chainId: PUNKCHAIN_CHAIN_ID,
  chainName: 'PunkChain',
  nativeCurrency: {
    name: 'Punk',
    symbol: 'PUNK',
    decimals: 18
  },
  rpcUrls: [UPGRADE_RPC_URL],
  blockExplorerUrls: []
}

const STATE_MAPPING = ['Pending', 'Active', 'Succeeded', 'Defeated', 'Executed', 'Canceled']
const LEVEL_MAPPING = ['Application', 'System', 'Infrastructure']

const governanceOptions = [
  { label: 'Parameter Upgrade', value: 'parameter' },
  { label: 'Contract Upgrade', value: 'upgrade' }
]

const activeGovernance = ref('parameter')
const filterValue = ref('all')
const sortValue = ref('desc')
const searchText = ref('')

const isParameterModalVisible = ref(false)
const isUpgradeModalVisible = ref(false)
const isCreating = ref(false)
const isDeployingImplementation = ref(false)
const isPreparingLocalNetwork = ref(false)
const isLoadingTable = ref(false)

const parameterData = ref([])
const upgradeData = ref([])
const registeredProxyOptions = ref([])
const parameterTotal = ref(0)
const upgradeTotal = ref(0)

const parameterForm = reactive({
  name: '',
  category: '',
  newValue: '',
  description: ''
})

const upgradeForm = reactive({
  proxy: upgradeDeployedData.proxy || '',
  newImplementation: upgradeDeployedData.newImplementation || '',
  callDataMode: 'none',
  multiplier: 3,
  callData: '0x',
  description: 'Upgrade the registered UUPS proxy to a new implementation.'
})

const activeGovernanceLabel = computed(() => (
  activeGovernance.value === 'parameter' ? 'Parameters' : 'Contracts'
))

const activeNetworkLabel = computed(() => (
  'PunkChain'
))

const createButtonLabel = computed(() => (
  activeGovernance.value === 'parameter' ? 'New Proposal' : 'New Proposal'
))

const localNetworkReady = computed(() => chainId.value?.toLowerCase() === PUNKCHAIN_CHAIN_ID)

const walletNetworkLabel = computed(() => (
  localNetworkReady.value ? 'PunkChain' : 'PunkChain required'
))

const searchPlaceholder = computed(() => (
  activeGovernance.value === 'parameter'
    ? 'Search parameter proposals'
    : 'Search proxy, implementation, or description'
))

const parameterColumns = [
  { title: 'PROPOSAL', dataIndex: 'proposal', key: 'proposal', width: '28%' },
  { title: 'STATE', dataIndex: 'state', key: 'state', width: '13%' },
  { title: 'DUE DATE', dataIndex: 'dueDate', key: 'dueDate', width: '19%' },
  { title: 'VOTES FOR', dataIndex: 'votesFor', key: 'votesFor', width: '14%' },
  { title: 'VOTES AGAINST', dataIndex: 'votesAgainst', key: 'votesAgainst', width: '14%' },
  { title: 'TOTAL VOTES', dataIndex: 'totalVotes', key: 'totalVotes', width: '12%' }
]

const upgradeColumns = [
  { title: 'PROPOSAL', dataIndex: 'proposal', key: 'proposal', width: '28%' },
  { title: 'STATE', dataIndex: 'state', key: 'state', width: '12%' },
  { title: 'PROXY', dataIndex: 'proxy', key: 'proxy', width: '16%' },
  { title: 'NEW IMPLEMENTATION', dataIndex: 'implementation', key: 'implementation', width: '18%' },
  { title: 'VOTES FOR', dataIndex: 'votesFor', key: 'votesFor', width: '13%' },
  { title: 'VOTES AGAINST', dataIndex: 'votesAgainst', key: 'votesAgainst', width: '13%' }
]

const activeColumns = computed(() => (
  activeGovernance.value === 'parameter' ? parameterColumns : upgradeColumns
))

const activeData = computed(() => (
  activeGovernance.value === 'parameter' ? parameterData.value : upgradeData.value
))

const filteredData = computed(() => {
  const normalizedSearch = searchText.value.trim().toLowerCase()
  const filtered = activeData.value.filter((item) => {
    const stateMatches = filterValue.value === 'all' || item.state.toLowerCase() === filterValue.value
    const textMatches = !normalizedSearch || [
      item.proposal,
      item.state,
      item.proxy,
      item.implementation,
      item.description
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch))

    return stateMatches && textMatches
  })

  return [...filtered].sort((a, b) => (
    sortValue.value === 'asc' ? Number(a.key) - Number(b.key) : Number(b.key) - Number(a.key)
  ))
})

const paginationConfig = ref({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20', '50'],
  showTotal: (total) => `Total ${total} items`,
  onChange: (page, pageSize) => {
    paginationConfig.value.current = page
    paginationConfig.value.pageSize = pageSize
  }
})

watch(filteredData, (rows) => {
  paginationConfig.value.total = rows.length
}, { immediate: true })

watch(activeGovernance, async () => {
  paginationConfig.value.current = 1
  searchText.value = ''
  filterValue.value = 'all'
  await fetchActiveProposals()
})

const showCreateModal = () => {
  if (activeGovernance.value === 'parameter') {
    isParameterModalVisible.value = true
  } else {
    isUpgradeModalVisible.value = true
  }
}

const resetParameterForm = () => {
  parameterForm.name = ''
  parameterForm.category = ''
  parameterForm.newValue = ''
  parameterForm.description = ''
}

const resetUpgradeForm = () => {
  upgradeForm.proxy = upgradeDeployedData.proxy || ''
  upgradeForm.newImplementation = upgradeDeployedData.newImplementation || ''
  upgradeForm.callDataMode = 'none'
  upgradeForm.multiplier = 3
  upgradeForm.callData = '0x'
  upgradeForm.description = 'Upgrade the registered UUPS proxy to a new implementation.'
}

const shortAddress = (address) => {
  if (!address || address === ethers.ZeroAddress) return '0x0000...0000'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const formatVotes = (votesAmount) => {
  const etherVal = Number(ethers.formatEther(votesAmount))
  if (etherVal >= 1000) return `${(etherVal / 1000).toFixed(1)}K`
  return etherVal.toString()
}

const formatDate = (timestamp) => {
  if (Number(timestamp) === 0) return 'TBD'
  const date = new Date(Number(timestamp) * 1000)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

const formatBps = (value) => `${(Number(value) / 100).toFixed(2)}%`

const getUpgradeGovernanceReadContract = () => {
  const provider = new ethers.JsonRpcProvider(UPGRADE_RPC_URL)
  return new ethers.Contract(upgradeDeployedData.upgradeGovernance, UpgradeGovernanceArtifact.abi, provider)
}

const ensurePunkChainNetwork = async () => {
  if (typeof window === 'undefined' || !window.ethereum) {
    message.error('MetaMask not detected. Please open this page in a browser with MetaMask enabled.')
    return false
  }

  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
  if (currentChainId?.toLowerCase() === PUNKCHAIN_CHAIN_ID) return true

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: PUNKCHAIN_CHAIN_ID }]
    })
    chainId.value = PUNKCHAIN_CHAIN_ID
    message.success('Switched to PunkChain')
    return true
  } catch (err) {
    if (err?.code === 4902) {
      message.warning('Please add PunkChain manually in MetaMask. Remote HTTP RPC URLs cannot be added automatically by MetaMask.')
      return false
    }

    if (err?.code !== 4001) {
      message.error(err?.shortMessage || err?.message || 'Failed to switch to PunkChain')
    }
    return false
  }
}

const prepareLocalNetwork = async () => {
  isPreparingLocalNetwork.value = true
  try {
    await ensurePunkChainNetwork()
  } finally {
    isPreparingLocalNetwork.value = false
  }
}

const getUpgradeGovernanceWriteContract = async () => {
  const onLocalNetwork = await ensurePunkChainNetwork()
  if (!onLocalNetwork) return null

  let signer = await getSigner()
  if (!signer) {
    const connected = await connect()
    if (!connected) return null
    signer = await getSigner()
  }
  return new ethers.Contract(upgradeDeployedData.upgradeGovernance, UpgradeGovernanceArtifact.abi, signer)
}

const handleCreateParameterProposal = async () => {
  isCreating.value = true
  try {
    const provider = new ethers.JsonRpcProvider(PARAMETER_RPC_URL)
    const deployer = new ethers.Wallet(PK_DEPLOYER, provider)
    const paramRegistry = new ethers.Contract(parameterDeployedData.paramRegistry, ParameterRegistryArtifact.abi, deployer)

    const categoryBytes32 = ethers.encodeBytes32String(parameterForm.category)
    const parameterId = ethers.keccak256(
      ethers.solidityPacked(['string', 'bytes32'], [parameterForm.name, categoryBytes32])
    )

    const newValueInt = parseInt(parameterForm.newValue, 10)
    if (Number.isNaN(newValueInt)) throw new Error('New Value must be a number')

    const encodedNewValue = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [newValueInt])
    const tx = await paramRegistry.proposeParameterChange(parameterId, encodedNewValue, parameterForm.description)
    await tx.wait()

    await fetchParameterProposals()
    message.success('Proposal created successfully')
    isParameterModalVisible.value = false
  } catch (err) {
    console.error(err)
    message.error(`Failed to create proposal: ${err.shortMessage || err.reason || err.message}`)
  } finally {
    isCreating.value = false
  }
}

const syncUpgradeCallData = () => {
  if (upgradeForm.callDataMode === 'none') {
    upgradeForm.callData = '0x'
    return
  }

  if (upgradeForm.callDataMode === 'initializeV2') {
    const iface = new ethers.Interface(UpgradeableCounterV2Artifact.abi)
    upgradeForm.callData = iface.encodeFunctionData('initializeV2', [upgradeForm.multiplier || 0])
  }
}

const fillDeployedImplementation = () => {
  upgradeForm.newImplementation = upgradeDeployedData.newImplementation || ''
  message.success('Implementation filled from deployed.json')
}

const deployV2Implementation = async () => {
  isDeployingImplementation.value = true
  try {
    const onLocalNetwork = await ensurePunkChainNetwork()
    if (!onLocalNetwork) return

    let signer = await getSigner()
    if (!signer) {
      const connected = await connect()
      if (!connected) return
      signer = await getSigner()
    }

    const signerAddress = await signer.getAddress()
    const signerProvider = signer.provider
    const balance = await signerProvider.getBalance(signerAddress)
    const gasEstimate = await signerProvider.estimateGas({
      from: signerAddress,
      data: UpgradeableCounterV2Artifact.bytecode
    })
    const feeData = await signerProvider.getFeeData()
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n
    if (gasPrice > 0n) {
      const estimatedCost = gasEstimate * gasPrice
      if (balance < estimatedCost) {
        throw new Error(`Insufficient PUNK for deployment gas. Need about ${ethers.formatEther(estimatedCost)} PUNK, current balance ${ethers.formatEther(balance)} PUNK.`)
      }
    }

    const factory = new ethers.ContractFactory(
      UpgradeableCounterV2Artifact.abi,
      UpgradeableCounterV2Artifact.bytecode,
      signer
    )
    const implementation = await factory.deploy({
      gasLimit: (gasEstimate * 120n) / 100n,
      ...(gasPrice > 0n ? { gasPrice } : {})
    })
    await implementation.waitForDeployment()

    upgradeForm.newImplementation = await implementation.getAddress()
    message.success(`New V2 implementation deployed: ${shortAddress(upgradeForm.newImplementation)}`)
  } catch (err) {
    console.error(err)
    message.error(`Deploy failed: ${err.shortMessage || err.reason || err.message}`)
  } finally {
    isDeployingImplementation.value = false
  }
}

const handleCreateUpgradeProposal = async () => {
  isCreating.value = true
  try {
    syncUpgradeCallData()
    if (!ethers.isAddress(upgradeForm.proxy)) throw new Error('Invalid proxy address')
    if (!ethers.isAddress(upgradeForm.newImplementation)) throw new Error('Invalid implementation address')
    if (!upgradeForm.callData || !upgradeForm.callData.startsWith('0x')) throw new Error('Call data must be hex')

    const upgradeGovernance = await getUpgradeGovernanceWriteContract()
    if (!upgradeGovernance) return

    const tx = await upgradeGovernance.proposeUpgrade(
      upgradeForm.proxy,
      upgradeForm.newImplementation,
      upgradeForm.callData,
      upgradeForm.description
    )
    await tx.wait()

    await fetchUpgradeProposals()
    message.success('Upgrade proposal created successfully')
    isUpgradeModalVisible.value = false
  } catch (err) {
    console.error(err)
    message.error(`Failed to create upgrade proposal: ${err.shortMessage || err.reason || err.message}`)
  } finally {
    isCreating.value = false
  }
}

const fetchParameterProposals = async () => {
  isLoadingTable.value = true
  try {
    const provider = new ethers.JsonRpcProvider(PARAMETER_RPC_URL)
    const paramRegistry = new ethers.Contract(parameterDeployedData.paramRegistry, ParameterRegistryArtifact.abi, provider)

    const count = await paramRegistry.proposalCount()
    const totalProposals = Number(count)
    const proposalIds = Array.from({ length: totalProposals }, (_, i) => totalProposals - i)

    const rows = await Promise.all(proposalIds.map(async (id) => {
      const [p, details] = await Promise.all([
        paramRegistry.getProposalBasic(id),
        paramRegistry.getProposalDetails(id)
      ])

      const paramInfo = await paramRegistry.getParameter(p.parameterId)
      const categoryString = ethers.decodeBytes32String(paramInfo.category)

      let decodedValue = 'Unknown'
      try {
        decodedValue = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], details.newValue)[0].toString()
      } catch (e) {
        console.error('Failed to decode newValue', e)
      }

      const total = details.forVotes + details.againstVotes

      return {
        key: p.id.toString(),
        proposal: `Upgrade ${paramInfo.name} to ${decodedValue} for ${categoryString} zone`,
        state: STATE_MAPPING[Number(p.state)],
        dueDate: formatDate(details.endTime),
        votesFor: formatVotes(details.forVotes),
        votesAgainst: formatVotes(details.againstVotes),
        totalVotes: formatVotes(total),
        description: p.description
      }
    }))

    parameterData.value = rows
    parameterTotal.value = totalProposals
  } catch (error) {
    console.error('Failed to load parameter proposals:', error)
    message.error('Failed to load parameter governance data')
  } finally {
    isLoadingTable.value = false
  }
}

const fetchRegisteredProxies = async () => {
  const upgradeGovernance = getUpgradeGovernanceReadContract()
  const proxies = await upgradeGovernance.getAllRegisteredProxies()

  registeredProxyOptions.value = await Promise.all(proxies.map(async (proxy) => {
    const info = await upgradeGovernance.getUpgradeableContract(proxy)
    const name = info.name || info[1]
    const level = Number(info.level ?? info[2])
    return {
      value: proxy,
      label: `${name} - ${LEVEL_MAPPING[level]} - ${shortAddress(proxy)}`
    }
  }))
}

const fetchUpgradeProposals = async () => {
  isLoadingTable.value = true
  try {
    const upgradeGovernance = getUpgradeGovernanceReadContract()
    await fetchRegisteredProxies()

    const count = await upgradeGovernance.proposalCount()
    const totalProposals = Number(count)
    const proposalIds = Array.from({ length: totalProposals }, (_, i) => totalProposals - i)

    const rows = await Promise.all(proposalIds.map(async (id) => {
      const [basic, details, upgrade] = await Promise.all([
        upgradeGovernance.getProposalBasic(id),
        upgradeGovernance.getProposalDetails(id),
        upgradeGovernance.getProposalUpgrade(id)
      ])

      let proxyName = 'Registered Proxy'
      let level = 0
      let category = 'unknown'
      try {
        const info = await upgradeGovernance.getUpgradeableContract(basic.proxy)
        proxyName = info.name || info[1]
        level = Number(info.level ?? info[2])
        category = ethers.decodeBytes32String(info.category ?? info[3])
      } catch (e) {
        console.warn('Failed to load proxy metadata', e)
      }

      return {
        key: basic.id.toString(),
        proposal: `${proxyName} upgrade to ${shortAddress(upgrade.newImplementation)}`,
        state: STATE_MAPPING[Number(basic.state)],
        proxy: shortAddress(basic.proxy),
        proxyAddress: basic.proxy,
        implementation: shortAddress(upgrade.newImplementation),
        implementationAddress: upgrade.newImplementation,
        dueDate: formatDate(details.endTime),
        votesFor: formatVotes(details.forVotes),
        votesAgainst: formatVotes(details.againstVotes),
        totalVotes: formatVotes(details.forVotes + details.againstVotes),
        description: basic.description,
        level: LEVEL_MAPPING[level],
        category,
        threshold: formatBps(basic.requiredThreshold)
      }
    }))

    upgradeData.value = rows
    upgradeTotal.value = totalProposals
  } catch (error) {
    console.error('Failed to load upgrade proposals:', error)
    message.error('Failed to load contract upgrade governance data')
  } finally {
    isLoadingTable.value = false
  }
}

const fetchActiveProposals = async () => {
  if (activeGovernance.value === 'parameter') {
    await fetchParameterProposals()
  } else {
    await fetchUpgradeProposals()
  }
}

const goToDetail = (id) => {
  router.push(`/proposal/${activeGovernance.value}/${id}`)
}

onMounted(async () => {
  await fetchParameterProposals()
  await fetchUpgradeProposals()
})
</script>

<style>
.custom-create-modal .ant-modal-content {
  border-radius: 18px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(212, 223, 238, 0.92);
  box-shadow: 0 28px 70px rgba(29, 42, 72, 0.22);
}
.custom-create-modal .ant-modal-header {
  margin: 0;
  padding: 22px 24px 16px;
  border-bottom: 1px solid #e6edf6;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(135deg, #fbfdff, #f2f6ff);
}
.custom-create-modal .ant-modal-title {
  color: var(--app-text);
  font-size: 21px;
  font-weight: 900;
  letter-spacing: 0;
}
.custom-create-modal .ant-modal-body {
  padding: 24px;
  background:
    radial-gradient(circle at 90% 2%, rgba(88, 104, 242, 0.1), transparent 24%),
    #ffffff;
}
.custom-create-modal .ant-form-item-label > label {
  color: #344057;
  font-weight: 850;
}
.custom-create-modal .ant-input,
.custom-create-modal .ant-input-number,
.custom-create-modal .ant-select-selector,
.custom-create-modal .ant-input-affix-wrapper {
  border-radius: 12px;
}
.custom-create-modal .submit-btn {
  background: linear-gradient(135deg, var(--app-primary), #775cf5);
  border: none;
  height: 48px;
  font-size: 16px;
  border-radius: 13px;
  font-weight: 900;
  box-shadow: 0 13px 26px rgba(88, 104, 242, 0.24);
}
.custom-create-modal .submit-btn:hover {
  background: linear-gradient(135deg, var(--app-primary-dark), #6248e4);
}
</style>

<style scoped>
.proposals-container {
  width: min(var(--app-page-width), calc(100% - var(--app-page-gutter)));
  margin: 0 auto;
  background: var(--app-page-gradient);
  border: 1px solid var(--app-border);
  border-top: 0;
  border-radius: 0 0 24px 24px;
  box-shadow: var(--app-shadow);
  overflow: hidden;
  box-sizing: border-box;
  color: var(--app-text);
}

.stats-header {
  display: flex;
  border-bottom: 0;
}
.governance-summary {
  padding: 24px 28px;
  background: transparent;
}
.go-back-section {
  padding: 24px;
  border-right: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  min-width: 180px;
}
.go-back-btn {
  font-weight: 700;
  font-size: 16px;
  border-radius: 6px;
  color: #1f2937;
  border-color: #d1d5db;
  height: 42px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-items {
  display: flex;
  gap: 16px;
  flex: 1;
}
.stat-box {
  flex: 1;
  min-height: 104px;
  padding: 20px 18px;
  border: 1px solid rgba(212, 223, 238, 0.92);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--app-shadow-soft);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  min-width: 0;
}
.last-stat {
  border-right: 1px solid rgba(212, 223, 238, 0.92);
}
.stat-label {
  font-size: 13px;
  color: var(--app-muted);
  margin-bottom: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.stat-value {
  font-size: 28px;
  font-weight: 900;
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
}
.stat-value.compact {
  font-size: 21px;
  text-align: center;
}

.governance-switch {
  padding: 24px 28px 0;
}
:deep(.ant-segmented) {
  background: #edf2f8;
  padding: 5px;
  border-radius: 14px;
}
:deep(.ant-segmented-item) {
  border-radius: 10px;
  font-weight: 800;
  color: #526078;
}
:deep(.ant-segmented-item-selected) {
  color: var(--app-text);
  box-shadow: 0 8px 18px rgba(57, 76, 115, 0.1);
}

.filter-bar {
  margin: 22px 28px 0;
  padding: 18px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--app-border-soft);
  border-bottom: 1px solid var(--app-border-soft);
  gap: 20px;
}
.search-wrap {
  width: 400px;
}
.search-input {
  border-radius: 12px;
  padding: 9px 13px;
  border-color: #d7e1ee;
  background: #ffffff;
  font-weight: 700;
}

.actions-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.select-group {
  display: flex;
  align-items: center;
  min-height: 42px;
  border: 1px solid #d7e1ee;
  border-radius: 12px;
  padding: 0 10px 0 12px;
  background: #ffffff;
}
.select-label {
  font-size: 13px;
  color: var(--app-muted);
  font-weight: 800;
}
.custom-select {
  width: 140px;
}
:deep(.ant-select-selector) {
  font-weight: 800;
  color: #2f3a50 !important;
}
.split-line {
  height: 24px;
  width: 1px;
  background: #dfe7f1;
  margin: 0 4px;
}
.new-proposal-btn {
  background: linear-gradient(135deg, var(--app-primary), #775cf5);
  border: 0;
  border-radius: 13px;
  font-weight: 900;
  height: 42px;
  padding: 0 22px;
  box-shadow: 0 13px 26px rgba(88, 104, 242, 0.24);
}
.new-proposal-btn:hover {
  background: linear-gradient(135deg, var(--app-primary-dark), #6248e4);
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}
.create-modal-hero {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) minmax(150px, auto);
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e2e9f4;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 255, 0.9)),
    #fbfdff;
  box-shadow: 0 10px 24px rgba(66, 82, 118, 0.08);
}
.create-modal-hero--parameter {
  border-color: rgba(88, 104, 242, 0.22);
}
.create-modal-hero--upgrade {
  border-color: rgba(20, 184, 166, 0.26);
}
.create-modal-hero__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: #536df6;
  background: #eef2ff;
  font-size: 20px;
}
.create-modal-hero--upgrade .create-modal-hero__icon {
  color: #109981;
  background: #e7fbf5;
}
.create-modal-hero__copy,
.create-modal-hero__meta {
  min-width: 0;
}
.create-modal-hero__copy span,
.create-modal-hero__meta span {
  display: block;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.create-modal-hero__copy strong,
.create-modal-hero__meta strong {
  display: block;
  margin-top: 4px;
  color: #1f2937;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.create-modal-hero__meta {
  justify-self: end;
  padding: 10px 12px;
  border: 1px solid #dfe7f1;
  border-radius: 13px;
  background: #ffffff;
  text-align: right;
}
.create-modal-hero__meta strong {
  color: #344157;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0;
}
.create-proposal-form {
  margin-top: 0;
}
.contract-preview {
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
.contract-preview span {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.contract-preview strong {
  color: #2f3a50;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
.upgrade-alert {
  margin-bottom: 18px;
  border-radius: 12px;
}
.network-flow {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: linear-gradient(135deg, #fbfdff, #f6f9ff);
}
.network-flow__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.network-flow__title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.network-flow__desc {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
}
.network-flow__tag {
  margin-inline-end: 0;
  font-weight: 700;
  border-radius: 6px;
}
.network-flow__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.network-flow__step {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(66, 82, 118, 0.05);
}
.network-flow__step.is-ready {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.network-flow__index {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 800;
}
.network-flow__step.is-ready .network-flow__index {
  background: #dcfce7;
  color: #16a34a;
}
.network-flow__step-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.network-flow__step-desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: #6b7280;
}
.prepare-network-btn {
  margin-top: 12px;
  border-radius: 12px;
  font-weight: 850;
}
.manual-network {
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  background: #ffffff;
}
.manual-network__title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}
.manual-network__grid {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 6px 12px;
  font-size: 12px;
  color: #6b7280;
}
.manual-network__grid strong {
  color: #111827;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.implementation-tools {
  display: flex;
  gap: 12px;
  margin: -2px 0 20px;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 12px;
  font-weight: 800;
  border-color: #d7e1ee;
  background: #ffffff;
  color: #344057;
}
.tool-btn:hover {
  border-color: #aebcf4;
  color: #445fe8;
  background: #f7faff;
}

:deep(.ant-table-wrapper) {
  padding: 0 22px 22px;
}
:deep(.ant-table) {
  background: transparent;
  color: var(--app-text);
}
:deep(.ant-table-container) {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--app-border-soft);
  background: #ffffff;
}
:deep(.ant-table-thead > tr > th) {
  background: #f3f6fb !important;
  color: #65748a !important;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--app-border-soft);
  padding: 15px 20px;
}
:deep(.ant-table-tbody > tr > td) {
  padding: 18px 20px;
  font-size: 15px;
  color: #2d384d;
  font-weight: 750;
  border-bottom: 1px solid var(--app-border-soft);
  background: #ffffff;
}
:deep(.ant-table-tbody > tr:hover > td) {
  background: #f7fbff !important;
}
.proposal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-weight: 900;
}
.proposal-title span {
  min-width: 0;
}
.link-icon {
  font-size: 12px;
  color: #5868f2;
  cursor: pointer;
  border: 1px solid #dfe6f2;
  border-radius: 50%;
  padding: 3px;
  flex: 0 0 auto;
  background: #f7f9ff;
}
.mono-address {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  font-weight: 700;
  color: #344157;
  letter-spacing: 0;
}

.state-tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
  background-color: #fff;
}
.state-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}
.active {
  border: 1px solid #c7d2fe;
  color: #4f46e5;
}
.active .dot { background-color: #4f46e5; }
.succeeded {
  border: 1px solid #bbf7d0;
  color: #16a34a;
}
.succeeded .dot { background-color: #16a34a; }
.executed {
  border: 1px solid #a5f3fc;
  color: #0891b2;
}
.executed .dot { background-color: #0891b2; }
.canceled,
.cancelled {
  border: 1px solid #d1d5db;
  color: #6b7280;
}
.canceled .dot,
.cancelled .dot { background-color: #6b7280; }
.defeated {
  border: 1px solid #fecaca;
  color: #dc2626;
}
.defeated .dot { background-color: #dc2626; }
.pending {
  border: 1px solid #fde68a;
  color: #d97706;
}
.pending .dot { background-color: #d97706; }

:deep(.custom-table-row) {
  cursor: pointer;
  transition: background-color 180ms ease, box-shadow 180ms ease;
}
:deep(.custom-table-row:hover) {
  box-shadow: none;
}
:deep(.ant-table-wrapper .ant-pagination) {
  margin: 18px 0 0;
}
:deep(.ant-pagination-item-active) {
  border-color: var(--app-primary);
}
:deep(.ant-pagination-item-active a) {
  color: var(--app-primary);
}

@media (max-width: 980px) {
  .stats-header,
  .filter-bar,
  .stat-items {
    flex-direction: column;
  }
  .go-back-section,
  .search-wrap {
    width: auto;
  }
  .go-back-section,
  .stat-box {
    border-right: none;
    border-bottom: 1px solid #f0f0f0;
  }
  .actions-wrap {
    flex-wrap: wrap;
    width: 100%;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .create-modal-hero {
    grid-template-columns: 44px minmax(0, 1fr);
  }
  .create-modal-hero__meta {
    grid-column: 1 / -1;
    justify-self: stretch;
    text-align: left;
  }
  .contract-preview {
    align-items: flex-start;
    flex-direction: column;
  }
  .contract-preview strong {
    text-align: left;
  }
  .implementation-tools {
    flex-direction: column;
  }
  .tool-btn {
    justify-content: center;
    width: 100%;
  }
  .network-flow__header,
  .network-flow__steps {
    display: flex;
    flex-direction: column;
  }
}
</style>
