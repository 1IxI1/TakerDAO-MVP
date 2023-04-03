import { Blockchain, SandboxContract, TreasuryContract, LogsVerbosity } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { Main } from '../wrappers/Main';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('Main', () => {
    let mainCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    let blockchain: Blockchain;

    let main: SandboxContract<Main>;
    let jettonMinter: SandboxContract<JettonMinter>;

    let oracle: SandboxContract<TreasuryContract>;

    let user: SandboxContract<TreasuryContract>;
    let userWallet: SandboxContract<JettonWallet>;

    beforeAll(async () => {
        mainCode = await compile('Main');

        blockchain = await Blockchain.create();
        blockchain.now = 100;

        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');

        oracle = await blockchain.treasury('oracle');
        user = await blockchain.treasury('user');

        main = blockchain.openContract(Main.createFromConfig({
            initTONPrice: 2,
            oracle: oracle.address,
            jettonWalletCode: jettonWalletCode,
            now: 100,
            minCollateralRatio: 1.5
        }, mainCode));

        blockchain.setVerbosityForAddress(main.address, { vmLogs: 'vm_logs' });

        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
            owner: main.address,
            jettonWalletCode: jettonWalletCode,
        }, jettonMinterCode));

        const deployer = await blockchain.treasury('deployer');
        const deployMasterResult = await jettonMinter.sendDeploy(deployer.getSender());

        expect(deployMasterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });

        const deployMainResult = await main.sendDeploy(deployer.getSender(), jettonMinter.address, toNano('0.05'));

        expect(deployMainResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            deploy: true,
            success: true
        });

        userWallet = blockchain.openContract(JettonWallet.createFromConfig({
            owner: user.address,
            mainContractAddress: main.address,
            jettonMasterAddress: jettonMinter.address,
        }, jettonWalletCode));
    });

    it('should deploy', async () => { });

    it('user should borrow $1000 with 1000 TON collateral successfully', async () => {
        const openVaultResult = await main.sendBorrow(
            user.getSender(), toNano('1000'), toNano('1000'));

        expect(openVaultResult.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: true
        });

        expect(openVaultResult.transactions).toHaveTransaction({
            from: main.address,
            to: jettonMinter.address,
            success: true
        });

        expect(openVaultResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: userWallet.address,
            success: true
        });

        const jettonWalletBalance = await userWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('1000'));

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('1000'));

        console.log("User's DCR:", userVault!.dcr);
    });

    it('should update TON price without any errors or liquidation', async () => {
        const updatePriceResult = await main.sendUpdatePrice(oracle.getSender(), 2.1);

        expect(updatePriceResult.transactions).toHaveTransaction({
            from: oracle.address,
            to: main.address,
            success: true
        });

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('1000'));
    });

    it('should let user repay the half of the debt', async () => {
        const repayResult = await userWallet.sendRepayRequest(user.getSender(), toNano('500'), toNano('500'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: user.address,
            to: userWallet.address,
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: main.address,
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: user.address,
            value: (x) => {
                if (x) return x > toNano(499) && x < toNano(500)
                else return false
            },
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: jettonMinter.address,
            op: 0x7bdd97de,
            success: true
        });

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('500'));
        expect(userVault!.dcr).toBeGreaterThan(0.9);
        expect(userVault!.dcr).toBeLessThan(1);

        console.log("User's DCR:", userVault!.dcr);

        const userWalletBalance = await userWallet.getBalance();
        expect(userWalletBalance).toBe(toNano('500'));
    });
});
