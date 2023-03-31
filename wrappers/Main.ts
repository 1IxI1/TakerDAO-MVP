import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

// storage#_ microusd_per_ton: uint32  // 2.3232 USD -> 2323200
//     min_cr: uint16  // 1.5 -> 1500
//     last_update: uint64
//     vaults: (HashmapE 267 Vault)
//     oracle_address: MsgAddressInt
//     jetton_master_address: MsgAddressInt
//     jetton_wallet_code: ^Cell
//     = Storage;

export type MainConfig = {
    initTONPrice: number,
    minCollateralRatio: number,
    oracle: Address,
    jettonMaster: Address,
    jettonWalletCode: Cell,
    now: number
};

export function formatPrice(price: number): number {
    // USD per TON -> microUSD per TON
    return Math.round(price * 10**6);
}

export function formatCollateralRatio(ratio: number): number {
    // 1.5 -> 1500
    return Math.round(ratio * 10**3);
}

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
            .storeUint(formatPrice(config.initTONPrice), 32)
            .storeUint(formatCollateralRatio(config.minCollateralRatio), 16)
            .storeUint(config.now, 64)
            .storeDict()
            .storeAddress(config.oracle)
            .storeAddress(config.jettonMaster)
            .storeRef(config.jettonWalletCode)
           .endCell();
}

export class Main implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Main(address);
    }

    static createFromConfig(config: MainConfig, code: Cell, workchain = 0) {
        const data = mainConfigToCell(config);
        const init = { code, data };
        return new Main(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
