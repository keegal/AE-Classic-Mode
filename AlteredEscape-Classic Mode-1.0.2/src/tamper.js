exports.mod = (mod_info) => {
	logger.logInfo("[MOD] Classic Mode");
    trader_f.handler.generateFenceAssort = require("./trader").handler.generateFenceAssort
    trader_f.handler.getAssort = require("./trader").handler.getAssort  
    ragfair_f.getOffers = require("./ragfair").getOffers;
    ragfair_f.createOffer = require("./ragfair").createOffer;
    trade_f.buyItem = require("./trade").buyItem;  
    move_f.addItem = require("./move").addItem
    logger.logSuccess("[MOD] Classic Mode Applied");
}