###微信支付 微信access_token管理 API集成
####初始化配置
    config/WXConfig.js 文件中配置微信相关信息
    redis.js 中需要配置redis连接信息.redis 用于全局缓存微信的access_token和jsapi_ticket(用于微信公众号调用接口的鉴权)
####修改IP地址
    WXService.js中的spbill_create_ip本地调试获取的ip不正确,需要手动设置,部署后ip获取正常

####执行 ./command 启动应用
    localhost:3000/wx-test/ 进行接口测试
    
####支持 Leancloud Leanengine 运行
    安装 leancloud的云引擎,运行 lean up 启动程序
    