import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

export type JettonWalletConfig = {
    owner: Address,
    mainContractAddress: Address,
    jettonMasterAddress: Address,
};

type JettonWalletConfigWithCode = JettonWalletConfig & {
    jettonWalletCode: Cell,
};

export function jettonWalletConfigToCell(config: JettonWalletConfigWithCode): Cell {
    return beginCell()
            .storeCoins(0)
            .storeAddress(config.owner)
            .storeAddress(config.mainContractAddress)
            .storeAddress(config.jettonMasterAddress)
            .storeRef(config.jettonWalletCode)
           .endCell();
}

export class JettonWallet implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell({ ...config, jettonWalletCode: code });
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }


    async getBalance(provider: ContractProvider) {
        const { stack } = await provider.get("get_wallet_data", []);
        return stack.readBigNumber();
    }

    async sendRepayRequest(provider: ContractProvider, via: Sender, stableTokens: bigint, wantedTons: bigint, amount: bigint, queryId = 0) {
        await provider.internal(via, {
            value: amount,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0x3, 32) // OP repay
                    .storeUint(queryId, 64)
                    .storeCoins(stableTokens)
                    .storeCoins(wantedTons)
                    .endCell(),
        });
    }

}

