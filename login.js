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

// 替代 waitForTimeout 的辅助函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 模拟人类行为的函数
async function simulateHumanBehavior(page) {
  console.log('开始模拟人类行为...');
  
  // 随机滚动页面
  await page.evaluate(() => {
    window.scrollTo(0, Math.random() * 300);
  });
  await delay(500 + Math.random() * 1000);
  
  console.log('人类行为模拟完成');
}

// 等待 Cloudflare 挑战通过
async function waitForCloudflareChallenge(page, timeout = 45000) {
  console.log('等待 Cloudflare 挑战...');
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // 检查是否还在挑战页面
    const title = await page.title();
    const url = page.url();
    const pageContent = await page.content();
    
    // 如果页面标题不包含挑战相关关键词，且页面内容包含登录表单或仪表板，则认为通过
    if ((!title.includes('Checking') && 
        !title.includes('Please Wait') && 
        !title.includes('Just a moment') &&
        !url.includes('challenges')) ||
        pageContent.includes('email') ||
        pageContent.includes('password') ||
        pageContent.includes('Login') ||
        pageContent.includes('Dashboard')) {
      console.log('Cloudflare 挑战已通过');
      return true;
    }
    
    console.log(`等待挑战中... (${Date.now() - startTime}ms)`);
    await delay(3000);
  }
  
  throw new Error(`Cloudflare 挑战超时 (${timeout}ms)`);
}

async function login() {
  const browser = await puppeteer.launch({
    headless: true, // 使用传统的 headless 模式
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
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

  try {
    console.log('正在访问网站...');
    
    // 先访问一个中性页面，让 Cloudflare 先验证
    await page.goto('https://www.google.com', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    await delay(2000);
    
    // 现在访问目标网站
    await page.goto(process.env.WEBSITE_URL, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // 等待 Cloudflare 挑战
    await waitForCloudflareChallenge(page);
    
    // 模拟人类行为
    await simulateHumanBehavior(page);
    
    // 等待登录表单加载，使用多种选择器
    console.log('等待登录表单...');
    
    // 尝试多种选择器
    const emailSelectors = ['#email', 'input[type="email"]', 'input[name="email"]', '[id*="email"]'];
    const passwordSelectors = ['#password', 'input[type="password"]', 'input[name="password"]', '[id*="password"]'];
    
    let emailField = null;
    let passwordField = null;
    
    for (const selector of emailSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        emailField = selector;
        break;
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }
    
    for (const selector of passwordSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        passwordField = selector;
        break;
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }
    
    if (!emailField || !passwordField) {
      // 如果没找到标准选择器，尝试通过页面内容查找
      const pageContent = await page.content();
      if (pageContent.includes('@') || pageContent.includes('user') || pageContent.includes('login')) {
        console.log('检测到登录页面但未找到标准表单，尝试继续...');
      } else {
        throw new Error('未找到登录表单');
      }
    }
    
    if (emailField) {
      console.log('输入邮箱...');
      await page.click(emailField);
      await delay(500);
      
      // 清空字段并输入
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) element.value = '';
      }, emailField);
      
      // 模拟人类输入
      const username = process.env.USERNAME;
      for (let char of username) {
        await page.type(emailField, char, { delay: 50 + Math.random() * 100 });
      }
    }
    
    await delay(1000 + Math.random() * 1000);
    
    if (passwordField) {
      console.log('输入密码...');
      await page.click(passwordField);
      await delay(500);
      
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) element.value = '';
      }, passwordField);
      
      // 模拟人类输入
      const password = process.env.PASSWORD;
      for (let char of password) {
        await page.type(passwordField, char, { delay: 50 + Math.random() * 100 });
      }
    }
    
    // 再次模拟人类行为
    await simulateHumanBehavior(page);
    
    console.log('寻找登录按钮...');
    
    // 尝试多种登录按钮选择器
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[type="button"]',
      '.btn',
      '.button',
      '[class*="login"]',
      '[class*="submit"]',
      '[onclick*="login"]'
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      const button = await page.$(selector);
      if (button) {
        const isVisible = await button.isIntersectingViewport();
        if (isVisible) {
          submitButton = selector;
          break;
        }
      }
    }
    
    if (!submitButton) {
      // 如果没找到按钮，尝试通过表单提交
      const form = await page.$('form');
      if (form) {
        console.log('通过表单提交登录...');
        await form.evaluate(form => form.submit());
      } else {
        throw new Error('未找到登录按钮或表单');
      }
    } else {
      console.log('点击登录按钮...');
      await page.click(submitButton);
    }
    
    // 等待页面变化
    console.log('等待登录结果...');
    await delay(8000);
    
    // 检查是否重定向
    const currentUrl = page.url();
    const title = await page.title();
    
    console.log('登录后 URL:', currentUrl);
    console.log('登录后标题:', title);
    
    // 检查登录成功的指标
    const pageContent = await page.content();
    const isSuccess = 
      !currentUrl.includes('login') && 
      !title.includes('Login') &&
      !pageContent.includes('Invalid') &&
      !pageContent.includes('Error') &&
      !pageContent.includes('incorrect') &&
      (pageContent.includes('Dashboard') || 
       pageContent.includes('Server') || 
       pageContent.includes('Welcome') ||
       pageContent.includes('Betadash') ||
       pageContent.includes('Lunes') ||
       pageContent.includes('Panel'));
    
    if (isSuccess) {
      await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, 
        `*登录成功！*\n时间: ${new Date().toISOString()}\n页面: ${currentUrl}\n标题: ${title}`);
      console.log('登录成功！');
    } else {
      // 检查是否有错误信息
      const hasError = await page.evaluate(() => {
        const errorSelectors = ['.error', '.alert-danger', '.text-danger', '[class*="error"]'];
        for (const selector of errorSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) return element.textContent;
        }
        return null;
      });
      
      if (hasError) {
        throw new Error(`登录失败: ${hasError}`);
      } else {
        throw new Error(`登录状态不确定。URL: ${currentUrl}, 标题: ${title}`);
      }
    }

    console.log('脚本执行完成。');
    
  } catch (error) {
    // 保存截屏和页面HTML用于调试
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `login-failure-${timestamp}.png`, fullPage: true });
    const htmlContent = await page.content();
    require('fs').writeFileSync(`login-debug-${timestamp}.html`, htmlContent);
    
    await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, 
      `*登录失败！*\n时间: ${new Date().toISOString()}\n错误: ${error.message}\n已保存调试信息`);
    
    console.error('登录失败：', error.message);
    console.error('截屏和HTML已保存');
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
