const puppeteer = require('puppeteer');
const axios = require('axios');

async function sendTelegramMessage(botToken, chatId, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  }).catch(error => {
    console.error('Telegram 通知失败:', error.message);
  });
}

// 模拟人类行为的函数
async function simulateHumanBehavior(page) {
  console.log('开始模拟人类行为...');
  
  // 随机移动鼠标
  const viewport = page.viewport();
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    await page.mouse.move(x, y);
    await page.waitForTimeout(200 + Math.random() * 300);
  }
  
  // 随机滚动页面
  await page.evaluate(() => {
    window.scrollTo(0, Math.random() * 500);
  });
  await page.waitForTimeout(500 + Math.random() * 1000);
  
  console.log('人类行为模拟完成');
}

// 等待 Cloudflare 挑战通过
async function waitForCloudflareChallenge(page, timeout = 30000) {
  console.log('等待 Cloudflare 挑战...');
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // 检查是否还在挑战页面
    const title = await page.title();
    const url = page.url();
    
    // 如果页面标题不包含挑战相关关键词，且URL不是挑战页面，则认为通过
    if (!title.includes('Checking') && 
        !title.includes('Please Wait') && 
        !url.includes('challenges') &&
        title !== 'Just a moment...') {
      console.log('Cloudflare 挑战已通过');
      return true;
    }
    
    // 检查是否有验证码元素
    const hasChallenge = await page.evaluate(() => {
      return document.querySelector('.cf-challenge') !== null || 
             document.querySelector('#challenge-form') !== null ||
             document.querySelector('.turnstile-wrapper') !== null;
    });
    
    if (!hasChallenge) {
      console.log('未检测到挑战元素，继续等待...');
    }
    
    await page.waitForTimeout(2000);
  }
  
  throw new Error(`Cloudflare 挑战超时 (${timeout}ms)`);
}

async function login() {
  const browser = await puppeteer.launch({
    headless: false, // 设置为 false 以便调试，生产环境可改回 true
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled', // 隐藏自动化特征
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });
  
  const page = await browser.newPage();
  
  // 隐藏自动化特征
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en'],
    });
  });
  
  // 设置更真实的用户代理和视口
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  try {
    console.log('正在访问网站...');
    await page.goto(process.env.WEBSITE_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // 等待可能的 Cloudflare 挑战
    await waitForCloudflareChallenge(page);
    
    // 模拟人类行为
    await simulateHumanBehavior(page);
    
    // 等待登录表单加载
    console.log('等待登录表单...');
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.waitForSelector('#password', { timeout: 15000 });
    
    // 模拟人类输入
    console.log('输入邮箱...');
    await page.type('#email', process.env.USERNAME, { 
      delay: 100 + Math.random() * 200 
    });
    
    await page.waitForTimeout(1000 + Math.random() * 1000);
    
    console.log('输入密码...');
    await page.type('#password', process.env.PASSWORD, { 
      delay: 80 + Math.random() * 150 
    });
    
    // 再次模拟人类行为
    await simulateHumanBehavior(page);
    
    // 等待可能的 Turnstile 验证
    console.log('等待可能的验证...');
    await page.waitForTimeout(5000);
    
    // 检查是否有 Turnstile 验证
    const hasTurnstile = await page.evaluate(() => {
      return document.querySelector('textarea[name="cf-turnstile-response"]') !== null ||
             document.querySelector('.cf-turnstile') !== null;
    });
    
    if (hasTurnstile) {
      console.log('检测到 Turnstile 验证，等待手动解决...');
      await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, 
        `*检测到验证码*\\n请手动完成验证，脚本将在 30 秒后继续...`);
      
      // 等待用户手动完成验证
      await page.waitForTimeout(30000);
    }
    
    console.log('点击登录按钮...');
    await page.click('button[type="submit"]');
    
    // 等待导航完成
    console.log('等待登录结果...');
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2', 
      timeout: 15000 
    }).catch(() => {
      console.log('导航超时，但可能已登录成功');
    });
    
    // 检查登录是否成功
    const currentUrl = page.url();
    const title = await page.title();
    
    console.log('登录后 URL:', currentUrl);
    console.log('登录后标题:', title);
    
    // 检查登录成功的指标
    const isSuccess = await page.evaluate(() => {
      // 检查是否有错误消息
      const errorMsg = document.querySelector('.error') || 
                      document.querySelector('.alert-danger') ||
                      document.querySelector('[class*="error"]');
      
      // 检查是否有成功指标（如仪表板、欢迎信息等）
      const successIndicator = document.querySelector('.dashboard') ||
                              document.querySelector('.server-list') ||
                              document.querySelector('[class*="welcome"]') ||
                              document.body.innerText.includes('Server Control') ||
                              document.body.innerText.includes('Dashboard');
      
      return !errorMsg && successIndicator;
    });
    
    if (isSuccess || (!currentUrl.includes('login') && !title.includes('Login'))) {
      await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, 
        `*登录成功！*\\n时间: ${new Date().toISOString()}\\n页面: ${currentUrl}\\n标题: ${title}`);
      console.log('登录成功！');
    } else {
      throw new Error(`登录可能失败。当前 URL: ${currentUrl}, 标题: ${title}`);
    }

    console.log('脚本执行完成。');
    
  } catch (error) {
    // 保存截屏和页面HTML用于调试
    await page.screenshot({ path: 'login-failure.png', fullPage: true });
    const htmlContent = await page.content();
    require('fs').writeFileSync('login-debug.html', htmlContent);
    
    await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, 
      `*登录失败！*\\n时间: ${new Date().toISOString()}\\n错误: ${error.message}\\n请检查 Artifacts 中的 login-debug`);
    
    console.error('登录失败：', error.message);
    console.error('截屏已保存为 login-failure.png');
    console.error('页面HTML已保存为 login-debug.html');
    throw error;
  } finally {
    await browser.close();
  }
}

// 添加错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

login();