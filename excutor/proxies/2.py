from ProxyProto import ProxyInterface, MAIN_INTERFACE
from typed import Plan,UpgradeTypes

MAIN_INTERFACE = "Interface"

class Interface(ProxyInterface):
    def onPlanAdded(self,plan:Plan):
        print("method1 implementation")

    def onStatusUpdated(self, status_from: UpgradeTypes, status_to: UpgradeTypes):
        
        print(status_from,status_to)


'''
def main(input):

    print("this is version 0")
    print(input * 2)
    args = sys.argv[:]
    print('Re-spawning %s' % ' '.join(args))

    args.insert(0, sys.executable)

    if sys.platform == 'win32':
        args = ['"%s"' % arg for arg in args]

    # os.chdir(_startup_cwd)
    os.execv(sys.executable, args)


if __name__ == "__main__":
    input = sys.argv[1]
    main(input)

'''