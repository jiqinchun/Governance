from multiprocessing import Process,Pipe
from threading import Thread

from GqlConnector import planFetcher
from PlanPool import PoolManeger
from ProxyManager import ProxyManger,ProxyMangerServer
from Logger import mainLogger


def main():

    mainLogger.info("initing instance")

    (planpipe_in,planpipe_out) = Pipe()

    pm = ProxyManger()
    pm_server_instance = ProxyMangerServer(pm)
    
    pool_manager_instance = PoolManeger(planpipe_out,pm)

    fetcher = Process(target=planFetcher,name="planfetcher",args=(planpipe_in,None))
    pm_server = Thread(target=pm_server_instance.start,name="pm_server")
    pool_manager = Thread(target=pool_manager_instance.start,name="pool_manager")

    pm_server.start()
    pool_manager.start()
    fetcher.start()

    mainLogger.info("All threads and process started")

    fetcher.join()


if __name__ == "__main__":
    
    main()