import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano} from 'ton-core';

export type JettonMinterConfig = {
    owner: Address;
    jettonWalletCode: Cell;
};

export function jettonLockupConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(0)  // supply
        .storeAddress(config.owner)
        .storeRef(beginCell().endCell())  // content
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class JettonMinter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonLockupConfigToCell(config);
        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender) {
        const value = toNano('0.05')
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async send(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body,
        });
    }

    async getSupply(provider: ContractProvider) {
        const { stack } = await provider.get("get_jetton_data", []);
        return stack.readNumber();
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const { stack } = await provider.get("get_wallet_address", [
            {type: 'slice', cell: beginCell().storeAddress(owner).endCell()}
        ]);
        return stack.readAddress();
    }
}
