"use strict";

/* TraderServer class maintains list of traders for each sessionID in memory. */
class TraderServer
{
    constructor() {
        this.traders = {};
        this.fence_generated_at = 0;
    }

    /* Load all the traders into memory. */

    getTrader(traderID, sessionID) {

        let pmcData = profile_f.handler.getPmcProfile(sessionID);
        if (!(traderID in pmcData.TraderStandings)) {
            trader_f.handler.resetTrader(sessionID, traderID);
            this.lvlUp(traderID, sessionID);
        }
        let trader = global._database.traders[traderID].base;
        trader.display = pmcData.TraderStandings[traderID].display;
        trader.loyalty.currentLevel = pmcData.TraderStandings[traderID].currentLevel;
        trader.loyalty.currentStanding = pmcData.TraderStandings[traderID].currentStanding.toFixed(3);
        trader.loyalty.currentSalesSum = pmcData.TraderStandings[traderID].currentSalesSum;

        return global._database.traders[traderID].base;
    }

    changeTraderDisplay(traderID, status, sessionID) {
        profile_f.handler.getPmcProfile(sessionID).TraderStandings[traderID].display = status;
    }

    getAllTraders(sessionID) {
        if (typeof sessionID == "undefined") {
            console.log("sessionID: " + sessionID);
            return;
        }

        let pmcData = profile_f.handler.getPmcProfile(sessionID);

        if (!pmcData || typeof pmcData == "undefined") {
            logger.logError(`Profile of ${sessionID} is undefined, and therefore cannot be loaded. Review the logs above for the cause.`)
        }

        let Traders = [];
        for (let traderID in global._database.traders) {
            if (traderID === "ragfair") {
                continue;
            }

            if (!(traderID in pmcData.TraderStandings)) {
                console.log("Resetting trader: " + traderID);
                this.resetTrader(sessionID, traderID);
            }

            let trader = global._database.traders[traderID].base;

            trader.display = pmcData.TraderStandings[traderID].display;
            trader.loyalty.currentLevel = pmcData.TraderStandings[traderID].currentLevel;
            trader.loyalty.currentStanding = pmcData.TraderStandings[traderID].currentStanding.toFixed(3);
            trader.loyalty.currentSalesSum = pmcData.TraderStandings[traderID].currentSalesSum;

            Traders.push(trader);
        }
        return Traders;
    }

    lvlUp(traderID, sessionID) {
        let pmcData = profile_f.handler.getPmcProfile(sessionID);
        let loyaltyLevels = global._database.traders[traderID].base.loyalty.loyaltyLevels;

        // level up player
        pmcData.Info.Level = profile_f.calculateLevel(pmcData);

        // level up traders
        let targetLevel = 0;

        for (let level in loyaltyLevels) {
            if ((loyaltyLevels[level].minLevel <= pmcData.Info.Level
                && loyaltyLevels[level].minSalesSum <= pmcData.TraderStandings[traderID].currentSalesSum
                && loyaltyLevels[level].minStanding <= pmcData.TraderStandings[traderID].currentStanding)
                && targetLevel < 4) {
                // level reached
                targetLevel++;
            }
        }

        // set level
        pmcData.TraderStandings[traderID].currentLevel = targetLevel;
        global._database.traders[traderID].base.loyalty.currentLevel = targetLevel;
    }

    resetTrader(sessionID, traderID) {
        let account = account_f.handler.find(sessionID);
        let pmcData = profile_f.handler.getPmcProfile(sessionID);
        let traderWipe = fileIO.readParsed(db.profile[account.edition]["trader_" + pmcData.Info.Side.toLowerCase()]);

        pmcData.TraderStandings[traderID] = {
            "currentLevel": 1,
            "currentSalesSum": traderWipe.initialSalesSum,
            "currentStanding": traderWipe.initialStanding,
            "NextLoyalty": null,
            "loyaltyLevels": global._database.traders[traderID].base.loyalty.loyaltyLevels,
            "display": global._database.traders[traderID].base.display
        };

        this.lvlUp(traderID, sessionID);
    }

    iter_item_children(item, item_list) {
        // Iterates through children of `item` present in `item_list`
        return item_list.filter((child_item) => child_item.parentId === item._id)
    }

    iter_item_children_recursively(item, item_list) {
        // Recursively iterates through children of `item` present in `item_list`

        let stack = this.iter_item_children(item, item_list)
        let child_items = [...stack]

        while (stack.length > 0) {
            let child = stack.pop()
            let children_of_child = this.iter_item_children(child, item_list)
            stack.push(...children_of_child)
            child_items.push(...children_of_child)
        }

        return child_items
    }

    generate_item_ids(...items) {
        const ids_map = {}

        for (const item of items) {
            ids_map[item._id] = utility.generateNewItemId()
        }

        for (const item of items) {
            item._id = ids_map[item._id]
            if (item.parentId in ids_map) {
                item.parentId = ids_map[item.parentId]
            }
        }
    }

    getAssort(sessionID, traderID, isBuyingFromFence = false) {
        if (traderID === "579dc571d53a0658a154fbec" && !isBuyingFromFence) { // Fence
			// Lifetime in seconds
			let fence_assort_lifetime = 600;

			// Current time in seconds
			let current_time = Math.floor(new Date().getTime() / 1000);
			
			//console.log(fence_assort_lifetime);
			//console.log(this.fence_generated_at + fence_assort_lifetime);
			//console.log(current_time);

			// Initial Fence generation pass.
			if (this.trader_generated_at[traderID] === 0 || !this.trader_generated_at[traderID]) {
				this.trader_generated_at[traderID] = current_time;
				this.generateFenceAssort();
                logger.logError(`assort generating`)
			}

			if (this.trader_generated_at[traderID] + fence_assort_lifetime < current_time) {
				this.trader_generated_at[traderID] = current_time;
				logger.logInfo("We are regenerating Fence's assort.")
				this.generateFenceAssort();
			}
		}
        // if (!(traderid in this.assorts)) {
            // // for modders generate endgame items for fence where you need to exchange it for that items
            // let tmp = fileio.readparsed(db.user.cache["assort_" + traderid]);
            // global._database.traders[traderid].assort = tmp.data;
        // }

        let baseAssorts = global._database.traders[traderID].assort;

        // Build what we're going to return.
        let assorts = this.copyFromBaseAssorts(baseAssorts);

        let pmcData = profile_f.handler.getPmcProfile(sessionID);

        if (traderID !== "ragfair") {
            // 1 is min level, 4 is max level
            let level = global._database.traders[traderID].base.loyalty.currentLevel;
            let questassort = {};
            if (typeof db.traders[traderID].questassort == "undefined") {
                questassort = {"started": {}, "success": {}, "fail": {}};

            } else if (fileIO.exist(db.traders[traderID].questassort)) {
                questassort = fileIO.readParsed(db.traders[traderID].questassort);

            } else {
                questassort = {"started": {}, "success": {}, "fail": {}};
            }

            for (let key in baseAssorts.loyal_level_items) {
                let requiredLevel = baseAssorts.loyal_level_items[key];
                if (requiredLevel > level) {
                    assorts = this.removeItemFromAssort(assorts, key);
                    continue;
                }

                if (key in questassort.started && quest_f.getQuestStatus(pmcData, questassort.started[key]) !== "Started") {
                    assorts = this.removeItemFromAssort(assorts, key);
                    continue;
                }

                if (key in questassort.success && quest_f.getQuestStatus(pmcData, questassort.success[key]) !== "Success") {
                    assorts = this.removeItemFromAssort(assorts, key);
                    continue;
                }

                if (key in questassort.fail && quest_f.getQuestStatus(pmcData, questassort.fail[key]) !== "Fail") {
                    assorts = this.removeItemFromAssort(assorts, key);
                }
            }
        }
        return assorts;
    }

    generateFenceAssort() {
        const fenceId = "579dc571d53a0658a154fbec"
        let base = {"items": [], "barter_scheme": {}, "loyal_level_items": {}};


        let fence_base_assort = fileIO.readParsed(db.user.cache.assort_579dc571d53a0658a154fbec).data.items

        let fence_base_assort_root_items = fence_base_assort.filter((item) => item.parentId === "hideout")

        const fence_assort = []
        const barter_scheme = {}

        const FENCE_ASSORT_SIZE = global._database.gameplayConfig.trading.AssortSize.traderAssortSize
        for (let i = 0; i < FENCE_ASSORT_SIZE; i++) {
            let random_item_index = utility.getRandomInt(0, fence_base_assort_root_items.length - 1)
            let random_item = fence_base_assort_root_items[random_item_index]
            let random_item_children = this.iter_item_children_recursively(random_item, fence_base_assort)

            this.generate_item_ids(random_item, ...random_item_children);
            if (fence_assort.some(el => el._id === random_item._id)) { continue; } // Prevent duplicate item IDs.
            fence_assort.push(random_item, ...random_item_children);


            let item_price = helper_f.getTemplatePrice(random_item._tpl);
            for (const child_item of random_item_children) {
                item_price += helper_f.getTemplatePrice(child_item._tpl);
            }

            barter_scheme[random_item._id] = [[
                {
                    count: Math.round(item_price),
                    _tpl: "5449016a4bdc2d6f028b456f" // Rubles template
                }
            ]];
        }

        base.items = fence_assort;
        base.barter_scheme = barter_scheme;
        global._database.traders[fenceId].assort = base;
    }

    // Deep clone (except for the actual items) from base assorts.
    copyFromBaseAssorts(baseAssorts) {
        let newAssorts = {};
        newAssorts.items = [];
        for (let item of baseAssorts.items) {
            newAssorts.items.push(item);
        }
        newAssorts.barter_scheme = {};
        for (let barterScheme in baseAssorts.barter_scheme) {
            newAssorts.barter_scheme[barterScheme] = baseAssorts.barter_scheme[barterScheme];
        }
        newAssorts.loyal_level_items = {};
        for (let loyalLevelItem in baseAssorts.loyal_level_items) {
            newAssorts.loyal_level_items[loyalLevelItem] = baseAssorts.loyal_level_items[loyalLevelItem];
        }
        return newAssorts;
    }

    // delete assort keys
    removeItemFromAssort(assort, itemID) {
        let ids_toremove = helper_f.findAndReturnChildrenByItems(assort.items, itemID);

        delete assort.barter_scheme[itemID];
        delete assort.loyal_level_items[itemID];

        for (let i in ids_toremove) {
            for (let a in assort.items) {
                if (assort.items[a]._id === ids_toremove[i]) {
                    assort.items.splice(a, 1);
                }
            }
        }

        return assort;
    }

    getCustomization(traderID, sessionID) {
        let pmcData = profile_f.handler.getPmcProfile(sessionID);
        let allSuits = customization_f.getCustomization();
        let suitArray = fileIO.readParsed(db.traders[traderID].suits);
        let suitList = [];

        for (let suit of suitArray) {
            if (suit.suiteId in allSuits) {
                for (var i = 0; i < allSuits[suit.suiteId]._props.Side.length; i++) {
                    let side = allSuits[suit.suiteId]._props.Side[i];

                    if (side === pmcData.Info.Side) {
                        suitList.push(suit);
                    }
                }
            }
        }

        return suitList;
    }

    getAllCustomization(sessionID) {
        let output = [];

        for (let traderID in global._database.traders) {
            if (db.traders[traderID].suits !== undefined) {
                output = output.concat(this.getCustomization(traderID, sessionID));
            }
        }

        return output;
    }

    getPurchasesData(traderID, sessionID) {
        let pmcData = profile_f.handler.getPmcProfile(sessionID);
        let trader = global._database.traders[traderID].base;
        let currency = helper_f.getCurrency(trader.currency);
        let output = {};

        // get sellable items
        for (let item of pmcData.Inventory.items) {
            let price = 0;

            if (item._id === pmcData.Inventory.equipment
                || item._id === pmcData.Inventory.stash
                || item._id === pmcData.Inventory.questRaidItems
                || item._id === pmcData.Inventory.questStashItems
                || helper_f.isNotSellable(item._tpl)
                || traderFilter(trader.sell_category, item._tpl) === false) {
                continue;
            }

            // find all child of the item (including itself) and sum the price
            for (let childItem of helper_f.findAndReturnChildrenAsItems(pmcData.Inventory.items, item._id)) {
                if (!global._database.items[childItem._tpl]) { continue; } // Ignore child item if it does not have an entry in the db. -- kiobu
                let tempPrice = (global._database.items[childItem._tpl]._props.CreditsPrice >= 1) ? global._database.items[childItem._tpl]._props.CreditsPrice : 1;
                let count = ("upd" in childItem && "StackObjectsCount" in childItem.upd) ? childItem.upd.StackObjectsCount : 1;
                price = price + (tempPrice * count);
            }

            // dogtag calculation
            if ("upd" in item && "Dogtag" in item.upd && helper_f.isDogtag(item._tpl)) {
                price *= item.upd.Dogtag.Level;
            }

            // meds calculation
            let hpresource = ("upd" in item && "MedKit" in item.upd) ? item.upd.MedKit.HpResource : 0;

            if (hpresource > 0) {
                let maxHp = helper_f.getItem(item._tpl)[1]._props.MaxHpResource;
                price *= (hpresource / maxHp);
            }

            // weapons and armor calculation
            let repairable = ("upd" in item && "Repairable" in item.upd) ? item.upd.Repairable : 1;

            if (repairable !== 1) {
                price *= (repairable.Durability / repairable.MaxDurability)
            }

            // get real price
            if (trader.discount > 0) {
                price -= (trader.discount / 100) * price
            }
            price = helper_f.fromRUB(price, currency);
            price = (price > 0 && price !== "NaN") ? price : 1;

            output[item._id] = [[{"_tpl": currency, "count": price.toFixed(0)}]];
        }

        return output;
    }
}

/*
check if an item is allowed to be sold to a trader
input : array of allowed categories, itemTpl of inventory
output : boolean
*/
function traderFilter(traderFilters, tplToCheck) {

    for (let filter of traderFilters) {
        for (let iaaaaa of helper_f.templatesWithParent(filter)) {
            if (iaaaaa == tplToCheck) {
                return true;
            }
        }

        for (let subcateg of helper_f.childrenCategories(filter)) {
            for (let itemFromSubcateg of helper_f.templatesWithParent(subcateg)) {
                if (itemFromSubcateg === tplToCheck) {
                    return true;
                }
            }
        }
    }

    return false;
}

module.exports.handler = new TraderServer();
