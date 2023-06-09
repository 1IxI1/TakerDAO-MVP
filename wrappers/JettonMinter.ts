import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano} from 'ton-core';

export type JettonMinterConfig = {
    owner: Address;
    jettonWalletCode: Cell;
    pseudoAuctionCode: Cell;
};

const contentB64 = 'te6cckECDwEAASMAAQMAwAECASACBAFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAMAQABodHRwczovL2kuaW1ndXIuY29tLzUwd3RySFkucG5nAgEgBQoCASAGCAFBv0VGpv/ht5z92GutPbh0MT3N4vsF5qdKp/NVLZYXx50TBwAYAERBSSBNTkUgVE9OAUG/btT5QqeEjOLLBmt3oRKMah/4xD9Dii3OJGErqf+riwMJAAgAREFJAgEgCw0BQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCQwAMgBEQUkgQW5hbG9nIGZvciBUT04uIE1WUC4BQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQ4ABAA53/xrbg=='

export function jettonLockupConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(toNano('10000'))  // supply (10k for pseudo auction contract's burnings)
        .storeAddress(config.owner)
        .storeRef(Cell.fromBase64(contentB64))  // content
        .storeRef(config.jettonWalletCode)
        .storeRef(config.pseudoAuctionCode)
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

    async sendDeploy(provider: ContractProvider, via: Sender, amount: bigint) {
        await provider.internal(via, {
            value: amount,
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
        return stack.readBigNumber();
    }
    async getOwner(provider: ContractProvider) {
        const { stack } = await provider.get("get_jetton_data", []);
        stack.readBigNumber();
        stack.readNumber();
        return stack.readAddress();
    }

    async getWalletAddress(provider: ContractProvider, owner: Address) {
        const { stack } = await provider.get("get_wallet_address", [
            {type: 'slice', cell: beginCell().storeAddress(owner).endCell()}
        ]);
        return stack.readAddress();
    }
}
