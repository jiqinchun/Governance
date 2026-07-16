import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Proposals from '../views/Proposals.vue'
import ProposalDetail from '../views/ProposalDetail.vue'
import UpgradeProposalDetail from '../views/UpgradeProposalDetail.vue'
import Treasury from '../views/Treasury.vue'
import TreasuryProposalDetail from '../views/TreasuryProposalDetail.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/proposals',
    name: 'Proposals',
    component: Proposals
  },
  {
    path: '/treasury',
    name: 'Treasury',
    component: Treasury
  },
  {
    path: '/proposal/:id',
    name: 'ProposalDetail',
    redirect: (to) => `/proposal/parameter/${to.params.id}`
  },
  {
    path: '/proposal/parameter/:id',
    name: 'ParameterProposalDetail',
    component: ProposalDetail
  },
  {
    path: '/proposal/upgrade/:id',
    name: 'UpgradeProposalDetail',
    component: UpgradeProposalDetail
  },
  {
    path: '/proposal/treasury/:id',
    name: 'TreasuryProposalDetail',
    component: TreasuryProposalDetail
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
