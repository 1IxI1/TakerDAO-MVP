import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, TupleBuilder, toNano, Dictionary, DictionaryValue } from 'ton-core';

// storage#_ microusd_per_ton: uint32  // 2.3232 USD -> 2323200
//     min_cr: uint16  // 1.5 -> 1500
//     last_update: uint64
//     vaults: (HashmapE 256 Vault)
//     oracle_address: MsgAddressInt
//     jetton_master_address: MsgAddressInt
//     jetton_wallet_code: ^Cell
//     pseudo_auction_code: ^Cell
//     = Storage;

export type MainConfig = {
    // here we are using number instead of bigint
    // because number values are small
    initTONPrice: number,
    minCollateralRatio: number,
    oracle: Address,
    jettonWalletCode: Cell,
    pseudoAuctionCode: Cell,
    now: number
};

export type Vault = {
    owner: Address,
    dcr: number,
    collateral: bigint,
    debt: bigint,
};


export function formatPrice(price: number): number {
    // USD per TON -> microUSD per TON
    return Math.round(price * 10**6);
}

export function formatCollateralRatio(ratio: number): number {
    // 1.5 -> 1500
    return Math.round(ratio * 10**3);
}

export function parsePrice(price: number): number {
    // microUSD per TON -> USD per TON
    return price / 10**6;
}

export function parseCollateralRatio(ratio: number): number {
    // 1500 -> 1.5
    return ratio / 10**3;
}

export type VaultValue = {
    dcr: number,
    collateral: bigint,
    debt: bigint
};

export const VaultVaules: DictionaryValue<VaultValue> = {
    serialize: (src, builder) => {
        builder.storeUint(formatCollateralRatio(src.dcr), 16);
        builder.storeCoins(src.collateral);
        builder.storeCoins(src.debt);
    },
    parse: (src) => {
        return {
            dcr: parseCollateralRatio(src.loadUint(16)),
            collateral: src.loadCoins(),
            debt: src.loadCoins()
        };
    }
};

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
            .storeUint(formatPrice(config.initTONPrice), 32)
            .storeUint(formatCollateralRatio(config.minCollateralRatio), 16)
            .storeUint(config.now, 64)
            .storeDict()
            .storeAddress(config.oracle)
            .storeAddress(null)
            .storeRef(config.jettonWalletCode)
            .storeRef(config.pseudoAuctionCode)
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

    async sendDeploy(provider: ContractProvider, via: Sender, jettonMinterAddress: Address, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0x29, 32) // OP init
                    .storeUint(0, 64) // query id
                    .storeAddress(jettonMinterAddress)
                    .endCell(),
        });
    }

    async sendBorrow(provider: ContractProvider, via: Sender, stableTokens: bigint, value: bigint, queryId = 0) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0x2, 32) // OP borrow
                    .storeUint(queryId, 64)
                    .storeCoins(stableTokens)
                    .endCell(),
        });
    }

    async sendUpdatePrice(provider: ContractProvider, via: Sender, price: number, queryId = 0) {
        await provider.internal(via, {
            value: toNano('0.02'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0x1, 32) // OP update_price
                    .storeUint(queryId, 64)
                    .storeUint(formatPrice(price), 64)
                    .endCell(),
        });
    }

    async getVault(provider: ContractProvider, owner: Address): Promise< Vault | null > {
        const params = new TupleBuilder()
        params.writeAddress(owner);
        const { stack } = await provider.get("get_vault", params.build());

        const success = stack.readBoolean();
        if (!success) {
            return null;
        }

        const cs = stack.readCell().beginParse();
        const dcr = cs.loadUint(16);
        const collateral = cs.loadCoins();
        const debt = cs.loadCoins();

        return {
            owner: owner,
            dcr: parseCollateralRatio(dcr),
            collateral: collateral,
            debt: debt,
        };
    }

    async getContractTonPrice(provider: ContractProvider): Promise<number> {
        const { stack } = await provider.get("get_all_contract_data", []);
        return parsePrice(stack.readNumber());
    }

    async getContractData(provider: ContractProvider) {
        const { stack } = await provider.get("get_all_contract_data", []);
        const tonPrice = parsePrice(stack.readNumber());
        const minCollateralRatio = parseCollateralRatio(stack.readNumber());
        const lastUpdate = stack.readNumber();
        const vaultsMaybeCell = stack.readCellOpt();
        const vaults = Dictionary.loadDirect(Dictionary.Keys.BigInt(256), VaultVaules, vaultsMaybeCell);
        const oracle = stack.readAddress();
        const jettonMasterAddress = stack.readAddress();
        const jettonWalletCode = stack.readCell();
        const pseudoAuctionCode = stack.readCell();
        return {
            tonPrice,
            minCollateralRatio,
            lastUpdate,
            vaults,
            oracle,
            jettonMasterAddress,
            jettonWalletCode,
            pseudoAuctionCode,
        };
    }
}
