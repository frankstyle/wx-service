module.exports = {
    //=======【微信基本信息设置】=====================================

    APP_ID: '',
    APP_SECRET: '',
    TOKEN: '',//微信接受消息的token
    MCH_ID: "",     //商户信息
    KEY: '',//商户密钥
    ACCESS_TOKEN_NAME:'',
    JSAPI_TICKET_NAME:'',
    // 支付调用类型
    TRADE_TYPE: {
        JSAPI: 'JSAPI',
        NATIVE: 'NATIVE',
        APP: 'APP'
    },
    NOTIFY_URL: 'http://huashi.leanapp.cn/wx/notify',
    // 统一订单请求地址
    UNIFIED_ORDER_URL : "https://api.mch.weixin.qq.com/pay/unifiedorder",
    ORDER_QUERY_URL : "https://api.mch.weixin.qq.com/pay/orderquery",
    ORDER_CLOSE_URL: "https://api.mch.weixin.qq.com/pay/closeorder"
}

