"use strict";
exports.buyItem = (pmcData, body, sessionID) => {
    if (!helper_f.payMoney(pmcData, body, sessionID)) {
        logger.logError("no money found");
        return "";
    }
	const newReq = {
		"items": [{
			"item_id": body.item_id,
			"count": body.count,
		}],
		"tid": body.tid
	};
    logger.logSuccess(`Bought item: ${body.item_id}`);
    if (body.item_id === "mystery_box") {
        let traderItems = fileIO.readParsed(`user/cache/assort_ragfair.json`).data;
        let index = utility.getRandomInt(0, traderItems.items.length);
        let newID = traderItems.items[index]._id;
        let newTpl = traderItems.items[index]._tpl;
        let salePrice = traderItems.barter_scheme[newID][0][0].count;
        while (salePrice === 0) {
            let substitute = utility.getRandomInt(0, traderItems.items.length);
            newID = traderItems.items[substitute]._id;
            newTpl = traderItems.items[substitute]._tpl;
            salePrice = traderItems.barter_scheme[newID][0][0].count;
            if (itemCat(newTpl) === false){
                let jackpot = utility.getRandomInt(0, 149);
                if (jackpot === 69){
                    newID = "5449016a4bdc2d6f028b456f";
                    body.count = 1000000;
                    salePrice = 0;
                }else{
                    salePrice = 1;
                }
            }
        }
        switch (itemCat(newTpl)){
            case "ammo":
                body.count = (body.count * 240);
                break;
            case "ammoBox":
                body.count = (body.count * 2);
                break;
            case "weapon":
                break;
            default:
                
        }
        body.item_id = newID;
        body.tid = "ragfair"
        newReq = {
            "items": [{
                "item_id": body.item_id,
                "count": body.count,
            }],
            "tid": body.tid
            
        };
    }
    return move_f.addItem(pmcData, newReq, item_f.handler.getOutput(), sessionID);
}
function itemCat(tpl){
    let itemList = fileIO.readParsed(`user/cache/items.json`);
    let ammo = "5485a8684bdc2da71d8b4567";
    let ammoBox = "543be5cb4bdc2deb348b4568";
    let weapon = [ 
        "5447b5fc4bdc2d87278b4567", "5447b6194bdc2d67278b4567", "5447b6094bdc2dc3278b4567", "5447b6254bdc2dc3278b4568", "5447bee84bdc2dc3278b4569",
        "5447b6254bdc2dc3278b4568", "5447b5cf4bdc2d65278b4567", "5447b5f14bdc2d61278b4567", "5447b5e04bdc2d62278b4567", "5447bed64bdc2d97278b4568"
    ]
    for (let item of Object.values(itemList.data)){
        if (item._id === tpl){
            if (item._parent === ammo){
                return "ammo";
            }
            else if (item._parent === ammoBox){
                return "ammoBox";
            }
            else if (weapon.includes(item._parent)){
                return "weapon";
            }
            else {
                return false;
            }
        }
    }
}
// Selling item to trader
exports.sellItem = (pmcData, body, sessionID) => {
    let money = 0;
    let prices = trader_f.handler.getPurchasesData(body.tid, sessionID);
    let output = item_f.handler.getOutput();

    for (let sellItem of body.items) {
        for (let item of pmcData.Inventory.items) {
            // profile inventory, look into it if item exist
            let isThereSpace = sellItem.id.search(" ");
            let checkID = sellItem.id;

            if (isThereSpace !== -1) {
                checkID = checkID.substr(0, isThereSpace);
            }

            // item found
            if (item._id === checkID) {
                logger.logError(`Selling: ${checkID}`);

                // remove item
                insurance_f.handler.remove(pmcData, checkID, sessionID);
                output = move_f.removeItem(pmcData, checkID, output, sessionID);

                // add money to return to the player
                if (output !== "") {
                    money += parseInt(prices[item._id][0][0].count);
                    break;
                }

                return "";
            }
        }
    }

    // get money the item]
    return helper_f.getMoney(pmcData, money, body, output, sessionID);
}

// separate is that selling or buying
exports.confirmTrading = (pmcData, body, sessionID) => {
    // buying
    if (body.type === "buy_from_trader") {
        return this.buyItem(pmcData, body, sessionID);
    }

    // selling
    if (body.type === "sell_to_trader") {
        return this.sellItem(pmcData, body, sessionID);
    }

    return "";
}

// Ragfair trading
exports.confirmRagfairTrading = (pmcData, body, sessionID) => {
    let ragfair_offers_traders = fileIO.readParsed(db.user.cache.ragfair_offers);
    let offers = body.offers;
    let output = item_f.handler.getOutput()

    for (let offer of offers) {
        pmcData = profile_f.handler.getPmcProfile(sessionID);

        body = {
            "Action": "TradingConfirm",
            "type": "buy_from_trader",
            "tid": "ragfair",
            "item_id": offer.id,
            "count": offer.count,
            "scheme_id": 0,
            "scheme_items": offer.items
        };

        for(let offerFromTrader of ragfair_offers_traders.offers)
        {
            if(offerFromTrader._id == offer.id)
            {
                body.tid = offerFromTrader.user.id;
                break;
            }
        }

        output = this.confirmTrading(pmcData, body, sessionID);
    }
    
    return output;
}