module.exports = {
    //=======【微信基本信息设置】=====================================

    APP_ID: '',
    APP_SECRET: '',
    TOKEN: '',//接入微信公众平台 服务端配置的Token
    MCH_ID: "",     //商户信息
    KEY: '',//商户密钥
    ACCESS_TOKEN_NAME:'HUA_SHI_ACCESS_TOKEN',
    JSAPI_TICKET_NAME:'HUA_SHI_JSAPI_TICKET',
    // 支付调用类型
    TRADE_TYPE: {
        JSAPI: 'JSAPI',
        NATIVE: 'NATIVE',
        APP: 'APP'
    },
    RECEIVED_MESSAGE_TYPE: {
        TEXT: 'text',
        IMAGE: 'image',
        VOICE: 'voice',
        VIDEO: 'video',
        SHORT_VIDEO: 'shortvideo',
        LOCATION: 'location',
        LINK: 'link',
        //事件类型
        EVENT_SUBSCRIBE: 'subscribe',
        EVENT_UNSUBSCRIBE: 'unsubscribe',
        EVENT_SCAN: 'SCAN',
        EVENT_LOCATION: 'LOCATION',
        EVENT_CLICK: 'CLICK',
        EVENT_VIEW: 'VIEW'
    },
    NOTIFY_URL: 'http://huashi.leanapp.cn/wx/notify',
    // 统一订单请求地址
    UNIFIED_ORDER_URL : "https://api.mch.weixin.qq.com/pay/unifiedorder",
    ORDER_QUERY_URL : "https://api.mch.weixin.qq.com/pay/orderquery",
    ORDER_CLOSE_URL: "https://api.mch.weixin.qq.com/pay/closeorder"
}

