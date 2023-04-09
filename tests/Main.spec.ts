import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, fromNano } from 'ton-core';
import { Main, Vault } from '../wrappers/Main';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { PseudoAuction } from '../wrappers/PseudoAuction';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('Main', () => {
    let mainCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;
    let pseudoAuctionCode: Cell;

    let blockchain: Blockchain;

    let main: SandboxContract<Main>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let pseudoAuction: SandboxContract<PseudoAuction>;

    let oracle: SandboxContract<TreasuryContract>;

    let user: SandboxContract<TreasuryContract>;
    let secUser: SandboxContract<TreasuryContract>;
    let userWallet: SandboxContract<JettonWallet>;
    let secUserWallet: SandboxContract<JettonWallet>;

    beforeAll(async () => {
        mainCode = await compile('Main');

        blockchain = await Blockchain.create();
        blockchain.now = 100;

        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');
        pseudoAuctionCode = await compile('PseudoAuction');

        oracle = await blockchain.treasury('oracle');
        user = await blockchain.treasury('user');
        secUser = await blockchain.treasury('secUser');

        main = blockchain.openContract(Main.createFromConfig({
            initTONPrice: 2,
            oracle: oracle.address,
            minCollateralRatio: 1.5,
            now: blockchain.now,
            jettonWalletCode: jettonWalletCode,
            pseudoAuctionCode: pseudoAuctionCode,
        }, mainCode));

        // blockchain.setVerbosityForAddress(main.address, { vmLogs: 'vm_logs' });

        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
            owner: main.address,
            jettonWalletCode: jettonWalletCode,
            pseudoAuctionCode: pseudoAuctionCode,
        }, jettonMinterCode));

        pseudoAuction = blockchain.openContract(PseudoAuction.createFromCode(pseudoAuctionCode));

        const deployer = await blockchain.treasury('deployer');
        const deployJettonResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.15'));
        console.log('jettonMinter address', jettonMinter.address);

        expect(deployJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });

        const deployMainResult = await main.sendDeploy(deployer.getSender(), jettonMinter.address, toNano('0.05'));
        console.log('main address', main.address);

        expect(deployMainResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            deploy: true,
            success: true
        });

        // blockchain.setVerbosityForAddress(pseudoAuction.address, { vmLogs: 'vm_logs' });

        const deployAuctionResult = await pseudoAuction.sendDeploy(deployer.getSender(), jettonMinter.address, toNano('0.05'));
        console.log('pseudoAuction address', pseudoAuction.address);

        expect(deployAuctionResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pseudoAuction.address,
            deploy: true,
            success: true
        });

        userWallet = blockchain.openContract(JettonWallet.createFromConfig({
            owner: user.address,
            mainContractAddress: main.address,
            jettonMasterAddress: jettonMinter.address,
        }, jettonWalletCode));

        secUserWallet = blockchain.openContract(JettonWallet.createFromConfig({
            owner: secUser.address,
            mainContractAddress: main.address,
            jettonMasterAddress: jettonMinter.address,
        }, jettonWalletCode));
    });

    it('should deploy', async () => {
        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10000'));
     });

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

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('11000'));

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
        const repayResult = await userWallet.sendRepayRequest(user.getSender(), toNano('500'), toNano('600'), toNano('0.05'));

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
            value: (x) => Math.round(Number(fromNano(x!))) === 600,
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

        expect(userVault!.dcr).toBeGreaterThan(0.79);
        expect(userVault!.dcr).toBeLessThanOrEqual(0.8);

        console.log("User's DCR:", userVault!.dcr);

        const userWalletBalance = await userWallet.getBalance();
        expect(userWalletBalance).toBe(toNano('500'));

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10500'));
    });

    it('should drop the price and liquidate the vault', async () => {
        const updatePriceResult = await main.sendUpdatePrice(oracle.getSender(), 1.5);

        expect(updatePriceResult.transactions).toHaveTransaction({
            from: oracle.address,
            to: main.address,
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: main.address,
            to: pseudoAuction.address,
            value: (x) => Math.round(Number(fromNano(x!))) === 400,
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: pseudoAuction.address,
            to: jettonMinter.address,
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: pseudoAuction.address,
            to: user.address,
            op: 0x52,
            success: true
        });

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10000'));

        const userVault = await main.getVault(user.address);
        expect(userVault).toBeNull();

        const userWalletBalance = await userWallet.getBalance();
        expect(userWalletBalance).toBe(toNano('500'));
    });

    it('should update the price to $2', async () => {
        const updatePriceResult = await main.sendUpdatePrice(oracle.getSender(), 2);

        expect(updatePriceResult.transactions).toHaveTransaction({
            from: oracle.address,
            to: main.address,
            success: true
        });
    });

    let secUserVault: Vault;

    it('should let another user borrow $1000 tokens for 800 TON ($1600)', async () => {
        const openVaultResult = await main.sendBorrow(
            secUser.getSender(), toNano('1000'), toNano('800'));

        expect(openVaultResult.transactions).toHaveTransaction({
            from: secUser.address,
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
            to: secUserWallet.address,
            success: true
        });

        const jettonWalletBalance = await secUserWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('1000'));

        secUserVault = (await main.getVault(secUser.address))!;

        expect(secUserVault).not.toBeNull();
        expect(secUserVault!.debt).toBe(toNano('1000'));

        expect(secUserVault!.dcr).toBeGreaterThan(0.79);
        // smth betweben 0.79 and 0.8 because of tiny fees
        expect(secUserVault!.dcr).toBeLessThanOrEqual(0.8);

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('11000'));

        console.log("User's DCR:", secUserVault!.dcr);
    });

    it('should not let him repay if his coll rate will be low', async () => {
        const repayResult = await secUserWallet.sendRepayRequest(secUser.getSender(), toNano('500'), toNano('600'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: secUser.address,
            to: secUserWallet.address,
            success: true
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: main.address,
            success: true,
            op: 0x30  // op::return_collateral
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: secUserWallet.address,
            success: true,
            op: 0x32, // op::repay_decline
            body: (x) => {
                const cs = x.beginParse();
                cs.skip(32 + 64); // op + query_id
                return cs.loadUint(8) == 4; // error_code
            }
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: secUser.address,
            success: true,
            op: 0x13 // op::repay_declined_notification
        });

        // nothing should be changed from the previous state
        const jettonWalletBalance = await secUserWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('1000'));

        const vault = await main.getVault(secUser.address);
        expect(vault).toEqual(secUserVault);
    });

    it('should not let him repay if he asked more than in coll', async () => {
        const repayResult = await secUserWallet.sendRepayRequest(secUser.getSender(), toNano('1000'), toNano('801'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: secUser.address,
            to: secUserWallet.address,
            success: true
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: main.address,
            success: true,
            op: 0x30  // op::return_collateral
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: secUserWallet.address,
            success: true,
            op: 0x32, // op::repay_decline
            body: (x) => {
                const cs = x.beginParse();
                cs.skip(32 + 64); // op + query_id
                return cs.loadUint(8) == 1; // error_code
            }
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: secUser.address,
            success: true,
            op: 0x13 // op::repay_declined_notification
        });

        // nothing should be changed from the previous state
        const jettonWalletBalance = await secUserWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('1000'));

        const vault = await main.getVault(secUser.address);
        expect(vault).toEqual(secUserVault);
    });
    it('should not let first user repay anything', async () => {
        const repayResult = await userWallet.sendRepayRequest(user.getSender(), toNano('1'), toNano('1'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: user.address,
            to: userWallet.address,
            success: true
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: main.address,
            success: true,
            op: 0x30  // op::return_collateral
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: userWallet.address,
            success: true,
            op: 0x32, // op::repay_decline
            body: (x) => {
                const cs = x.beginParse();
                cs.skip(32 + 64); // op + query_id
                return cs.loadUint(8) == 0; // error_code
            }
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: user.address,
            success: true,
            op: 0x13 // op::repay_declined_notification
        });

        // nothing should be changed from the previous state
        const jettonWalletBalance = await userWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('500'));

        const vault = await main.getVault(user.address);
        expect(vault).toBe(null);
    });

    let lastCollateral: bigint;
    it('should let second user repay a bit', async () => {
        const repayResult = await secUserWallet.sendRepayRequest(secUser.getSender(), toNano('100'), toNano('100'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: secUser.address,
            to: secUserWallet.address,
            success: true
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: main.address,
            success: true,
            op: 0x30  // op::return_collateral
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: secUserWallet.address,
            success: true,
            op: 0x31, // op::repay_approve
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: jettonMinter.address,
            success: true,
            op: 0x7bdd97de // op::burn_notification
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: secUser.address,
            success: true,
        });

        const jettonWalletBalance = await secUserWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('900'));

        const vault = await main.getVault(secUser.address);
        expect(vault!.debt).toBe(toNano('900'));
        expect(Number(fromNano(vault!.collateral))).toBeCloseTo(700, 0);
    });
    it('should let second user repay all', async () => {
        const oldVault = await main.getVault(secUser.address);
        const repayResult = await secUserWallet.sendRepayRequest(secUser.getSender(), oldVault!.debt, oldVault!.collateral, toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: secUser.address,
            to: secUserWallet.address,
            success: true
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: main.address,
            success: true,
            op: 0x30  // op::return_collateral
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: secUserWallet.address,
            success: true,
            op: 0x31, // op::repay_approve
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: secUserWallet.address,
            to: jettonMinter.address,
            success: true,
            op: 0x7bdd97de // op::burn_notification
        });
        expect(repayResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: secUser.address,
            success: true,
        });

        const jettonWalletBalance = await secUserWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('0'));

        const vault = await main.getVault(secUser.address);
        expect(vault).toBe(null);
    });
});
