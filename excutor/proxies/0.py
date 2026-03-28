
from ProxyProto import ProxyInterface, MAIN_INTERFACE
from typed import Plan,Status,Proxy

from web3 import Web3
from eth_abi import abi

from Logger import getProxyLogger

from GqlConnector import fetchProxies
import requests

from ProxyManager import ProxyMangerApi

MAIN_INTERFACE = "ProxyUpdateAndControlInterface"
PROXY_ID = 0

logger = getProxyLogger(PROXY_ID)

class ProxyUpdateAndControlInterface(ProxyInterface):
    def __init__(self, plan: Plan) -> None:
        super().__init__(plan)
        self.web3 = Web3(Web3.HTTPProvider('http://127.0.0.1:8545'))
        self.testvalue = 5
    def onPlanAdded(self):
    
        self.testvalue = 10
        logger.info("{} on Plan {} added".format(PROXY_ID,self.plan["id"]))

        proxy_id = abi.decode(["uint256"],self.plan["proxyParameter"])[0]

        logger.info("Proxy {} detected".format(proxy_id))

        proxys = fetchProxies()

        proxy_tobe_download = None
        for p in proxys:
            if p["id"] == proxy_id:
                proxy_tobe_download = p
                self.proxy_tobe_download = proxy_tobe_download
                logger.debug("Proxy {} found {}".format(proxy_id, p))
                break
        
        if proxy_tobe_download:
            download_link = proxy_tobe_download["url"]
            filename = str(proxy_id) + ".py"
            import requests
            with open("proxies/"+filename,"wb")as f:
                r = requests.get(proxy_tobe_download["url"],allow_redirects=True)
                f.write(r.content)
            
            logger.info("Proxy  {} file downloaded".format(proxy_id))

            from multiprocessing.connection import Client
            c = Client(("127.0.0.1",22321))

            module_path = '{}.{}'.format("proxies",proxy_id)
            data = ("register",[proxy_id, module_path])

            logger.info("Proxy  {} to be registed".format(data))
            c.send(data)

            c.close()

        else:
            raise Exception("Proxy {} can't fetch from dataspirce".format(proxy_id))


    def onStatusUpdated(self, status_from: Status, status_to: Status):
        logger.info("onStatusUpdated called by plan {} from {} to {} ".format(self.plan["id"],status_from,status_to))

        print(self.testvalue)