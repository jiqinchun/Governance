import logging
from typed import Proxy_id

LOG_LEVEL = logging.INFO
LOG_FILE = "excutor.log"

formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)

file_handler = logging.FileHandler(LOG_FILE)
file_handler.setFormatter(formatter)



def setupLogger(name):
    logger = logging.Logger(name,level=LOG_LEVEL)
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    return logger

def getProxyLogger(proxy_id:Proxy_id):
    name = "Prxoy {}".format(proxy_id)
    return setupLogger(name)

fetcherLogger = setupLogger("Fetcher")
poolManagerLogger = setupLogger("PlanPool")
proxyManagerLogger = setupLogger("ProxyManager")
proxManagerServerLogger = setupLogger("ProxManagerServer")
mainLogger = setupLogger("Main")




