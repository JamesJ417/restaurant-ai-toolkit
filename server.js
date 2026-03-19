const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// Multiple AI models for different tasks
const AI_MODELS = {
  fast: 'tinyllama',        // Tiny, fast, ~1GB
  balanced: 'tinyllama',   // Good balance
  best: 'tinyllama'        // Most capable
};

// Health check endpoint
function handleHealthCheck(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    models: AI_MODELS
  }));
}
const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_YOUR_PRICE_ID';
const DOMAIN = process.env.DOMAIN || 'https://restaurantmarketingai.app';

const PORT = process.env.PORT || 18790;
const APP_DIR = __dirname;

// In-memory store (would be a database in production)
const users = {};
const sessions = {};
const generations = {};
let userIdCounter = 1;

// Rate limiting - 4 requests per minute per user
const rateLimitMap = new Map();
function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const limit = 4;
  
  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const userLimit = rateLimitMap.get(userId);
  if (now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userLimit.count >= limit) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// Load existing data
function loadData() {
  try {
    if (fs.existsSync(path.join(APP_DIR, 'users.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'users.json'), 'utf8'));
      Object.assign(users, data);
      userIdCounter = Math.max(...Object.keys(users).map(Number), 0) + 1;
    }
  } catch(e) { console.log('No existing users'); }
  
  try {
    if (fs.existsSync(path.join(APP_DIR, 'sessions.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'sessions.json'), 'utf8'));
      Object.assign(sessions, data);
    }
  } catch(e) { console.log('No existing sessions'); }
  
  try {
    if (fs.existsSync(path.join(APP_DIR, 'generations.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'generations.json'), 'utf8'));
      Object.assign(generations, data);
    }
  } catch(e) { console.log('No existing generations'); }
}

function saveData() {
  fs.writeFileSync(path.join(APP_DIR, 'users.json'), JSON.stringify(users, null, 2));
  fs.writeFileSync(path.join(APP_DIR, 'sessions.json'), JSON.stringify(sessions, null, 2));
  fs.writeFileSync(path.join(APP_DIR, 'generations.json'), JSON.stringify(generations, null, 2));
}

// Initialize
loadData();

// Tool prompts
const TOOL_PROMPTS = {
  generate_job_post: `You are a restaurant owner creating a job post. Make it engaging and professional.`,
  generate_review_response: `You are a restaurant owner. Write a reply to this customer review.`,
  generate_social_post: `You are a restaurant social media manager. Create engaging, platform-appropriate posts.`,
  generate_menu_description: `You are a restaurant menu writer. Create mouth-watering, appetizing descriptions.`,
  generate_email: `You are a restaurant owner writing marketing emails. Professional, engaging, clear call to action.`,
  generate_special: `You are a restaurant owner creating a special menu item description. Make it mouth-watering and appealing.`,
};

function buildToolPrompt(toolName, input) {
  const basePrompt = TOOL_PROMPTS[toolName] || 'You are a helpful assistant.';
  
  let context = '\n\nInput data:\n';
  for (const [key, value] of Object.entries(input)) {
    if (value) context += `- ${key}: ${value}\n`;
  }
  
  let outputFormat = '';
  switch(toolName) {
    case 'generate_job_post':
      outputFormat = '\n\nCreate a 200-400 word job post. Include restaurant name naturally. Add: job summary, responsibilities, requirements, benefits, and how to apply.';
      break;
    case 'generate_review_response':
      outputFormat = '\n\nRespond to this review in a friendly, warm tone. 2-3 sentences.';
      break;
    case 'generate_social_post':
      outputFormat = '\n\nCreate a platform-appropriate post. Keep it natural and engaging. Use the restaurant name.';
      break;
    case 'generate_menu_description':
      outputFormat = '\n\nWrite a 25-75 word appetizing description. Make it mouth-watering.';
      break;
    case 'generate_email':
      outputFormat = '\n\nWrite a 100-400 word email. Professional, engaging, with clear call to action. Use the restaurant name.';
      break;
    case 'generate_special':
      outputFormat = '\n\nCreate a menu special description. Include name, description, price. Make it appetizing.';
      break;
  }
  
  return context + '\n\n' + basePrompt + ' ' + outputFormat;
}

// Call AI - tries Ollama (free local), then falls back to OpenClaw
async function callAgent(agentId, prompt) {
  // Try Ollama first (free, local, no per-use cost)
  const startTime = Date.now();
  
  try {
    // Use the best model for quality
    const model = AI_MODELS.best;
    console.log(`AI: Using model ${model}`);
    
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 280,
          stop: ["\n\n"]
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.message?.content) {
        const duration = Date.now() - startTime;
        console.log(`AI: Success in ${duration}ms`);
        return data.message.content;
      }
    } else {
      console.error('AI: Ollama error', response.status, await response.text());
    }
  } catch (err) {
    console.error('AI: Ollama unavailable -', err.message);
  }
  
  // Fall back to OpenClaw
  return new Promise((resolve, reject) => {
    const child = spawn('openclaw', ['agent', '--agent', agentId, '--message', prompt, '--json'], {
      cwd: '/home/james/.openclaw/workspace',
      env: { ...process.env, OPENCLAW_JSON: '1' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    
    child.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const json = JSON.parse(stdout);
          if (json.result && json.result.payloads && json.result.payloads[0]) {
            resolve(json.result.payloads[0].text);
          } else if (json.response) {
            resolve(json.response);
          } else {
            resolve(stdout.trim());
          }
        } catch(e) {
          resolve(stdout.trim());
        }
      } else {
        resolve('AI temporarily unavailable. Please try again.');
      }
    });
    
    child.on('error', (err) => {
      resolve('AI connection error: ' + err.message);
    });
    
    setTimeout(() => {
      child.kill();
      resolve('AI request timed out');
    }, 45000);
  });
}

// HTTP Server
const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const query = parsed.searchParams;
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (req.method === 'GET' && pathname === '/health') {
    handleHealthCheck(req, res);
    return;
  }
  
  console.log(`${req.method} ${pathname}`);
  
  // ==================== AUTH API ====================
  
  // Signup
  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { email, password, restaurantName } = JSON.parse(body);
        
        // Check if user exists
        const existingUser = Object.values(users).find(u => u.email === email);
        if (existingUser) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email already registered' }));
          return;
        }
        
        const userId = userIdCounter++;
        const user = {
          id: userId,
          email,
          password, // In production, hash this!
          restaurantName: restaurantName || '',
          paid: false,
          freeTrialUsed: 0,
          created: new Date().toISOString()
        };
        
        users[userId] = user;
        generations[userId] = [];
        
        // Create session
        const sessionId = crypto.randomUUID();
        sessions[sessionId] = {
          userId,
          email,
          expires: Date.now() + (7 * 24 * 60 * 60 * 1000)
        };
        
        saveData();
        
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Set-Cookie': `session=${sessionId}; Path=/; Max-Age=${7*24*60*60}; SameSite=Lax`
        });
        res.end(JSON.stringify({ 
          success: true, 
          user: { id: userId, email, restaurantName, paid: false, freeTrialUsed: 0 },
          sessionId
        }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Login
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { email, password } = JSON.parse(body);
        
        const user = Object.values(users).find(u => u.email === email && u.password === password);
        
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid email or password' }));
          return;
        }
        
        // Create session
        const sessionId = crypto.randomUUID();
        sessions[sessionId] = {
          userId: user.id,
          email,
          expires: Date.now() + (7 * 24 * 60 * 60 * 1000)
        };
        
        saveData();
        
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Set-Cookie': `session=${sessionId}; Path=/; Max-Age=${7*24*60*60}; SameSite=Lax`
        });
        res.end(JSON.stringify({ 
          success: true, 
          user: { id: user.id, email: user.email, restaurantName: user.restaurantName, paid: user.paid, freeTrialUsed: user.freeTrialUsed },
          sessionId
        }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    if (sessionMatch) {
      delete sessions[sessionMatch[1]];
      saveData();
    }
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Get current user
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]] || Date.now() > sessions[sessionMatch[1]].expires) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Not logged in' }));
      return;
    }
    
    const session = sessions[sessionMatch[1]];
    const user = users[session.userId];
    
    if (!user) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      id: user.id, 
      email: user.email, 
      restaurantName: user.restaurantName, 
      paid: user.paid,
      freeTrialUsed: user.freeTrialUsed 
    }));
    return;
  }
  
  // Update user profile
  if (req.method === 'PUT' && pathname === '/api/auth/profile') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const session = sessions[sessionMatch[1]];
      const user = users[session.userId];
      const updates = JSON.parse(body);
      
      if (updates.restaurantName) user.restaurantName = updates.restaurantName;
      if (updates.paid !== undefined) user.paid = updates.paid;
      if (updates.freeTrialUsed !== undefined) user.freeTrialUsed = updates.freeTrialUsed;
      
      saveData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  
  // ==================== PAYMENT API ====================
  
  // Create Stripe checkout session
  if (req.method === 'POST' && pathname === '/api/payment/checkout') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    const session = sessions[sessionMatch[1]];
    const user = users[session.userId];
    
    if (user.paid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Already paid' }));
      return;
    }
    
    // Create Stripe checkout session
    if (!stripe) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payment not configured' }));
      return;
    }
    
    stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Restaurant AI Toolkit - Lifetime Access',
            description: 'Unlimited job posts, review responses, social media, menu descriptions, and email marketing'
          },
          unit_amount: 9700, // $97.00
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${DOMAIN}/dashboard.html?paid=true`,
      cancel_url: `${DOMAIN}/dashboard.html?cancelled=true`,
      metadata: {
        userId: user.id.toString()
      }
    }).then(checkoutSession => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: checkoutSession.url }));
    }).catch(err => {
      console.error('Stripe error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payment error' }));
    });
    return;
  }
  
  // Stripe webhook
  if (req.method === 'POST' && pathname === '/api/payment/webhook') {
    if (!stripe) {
      res.writeHead(503);
      res.end();
      return;
    }
    
    const sig = req.headers['stripe-signature'];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userId = parseInt(session.metadata.userId);
          if (users[userId]) {
            users[userId].paid = true;
            saveData();
            console.log(`User ${userId} marked as paid`);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch(err) {
        console.error('Webhook error:', err.message);
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  
  // ==================== GENERATIONS API ====================
  
  // Get user's generations
  if (req.method === 'GET' && pathname === '/api/generations') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    const session = sessions[sessionMatch[1]];
    const userGens = generations[session.userId] || [];
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userGens));
    return;
  }
  
  // Get single generation
  if (req.method === 'GET' && pathname.startsWith('/api/generations/')) {
    const id = pathname.split('/').pop();
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    const session = sessions[sessionMatch[1]];
    const userGens = generations[session.userId] || [];
    const gen = userGens.find(g => g.id === id);
    
    if (!gen) {
      res.writeHead(404);
      res.end();
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(gen));
    return;
  }
  
  // Save generation
  if (req.method === 'POST' && pathname === '/api/generations/save') {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { tool, input, output } = JSON.parse(body);
        const session = sessions[sessionMatch[1]];
        
        if (!generations[session.userId]) generations[session.userId] = [];
        
        const gen = {
          id: Date.now().toString(),
          tool,
          input,
          output,
          created: new Date().toISOString()
        };
        
        generations[session.userId].unshift(gen);
        
        // Keep only last 50
        if (generations[session.userId].length > 50) {
          generations[session.userId] = generations[session.userId].slice(0, 50);
        }
        
        saveData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(gen));
      } catch(e) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  
  // ==================== TOOL API ====================
  
  // Generate content
  if (req.method === 'POST' && pathname.startsWith('/api/tool/')) {
    const cookie = req.headers.cookie || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (!sessionMatch || !sessions[sessionMatch[1]]) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Please log in' }));
      return;
    }
    
    const session = sessions[sessionMatch[1]];
    const user = users[session.userId];
    
    // Rate limit check
    if (!checkRateLimit(user.id)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests. Please wait a moment.' }));
      return;
    }
    
    // Check payment status
    if (!user.paid && user.freeTrialUsed >= 5) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'PAYMENT_REQUIRED', message: 'Free trial used. Please purchase to continue.' }));
      return;
    }
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const toolName = pathname.replace('/api/tool/', '');
        const input = JSON.parse(body);
        
        // Add restaurant name to input
        input.restaurantName = user.restaurantName;
        
        const prompt = buildToolPrompt(toolName, input);
        let response = await callAgent('restaurant', prompt);
        
        // Truncate long responses based on requested length
        const maxLength = input.length || 500;
        if (response.length > maxLength) {
          response = response.substring(0, maxLength - 3) + '...';
        }
        
        // Use free trial if not paid
        if (!user.paid && !user.freeTrialUsed) {
          user.freeTrialUsed += 1;
          saveData();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          response,
          freeTrialUsed: user.freeTrialUsed,
          paid: user.paid
        }));
      } catch(e) {
        console.error('Tool error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // ==================== STATIC FILES ====================
  
  // Serve static files
  let filePath = path.join(APP_DIR, pathname === '/' ? 'index.html' : pathname);
  
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
  };
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading file');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Restaurant AI Toolkit running on port ${PORT}`);
});// rebuild Wed Mar 18 00:07:48 EDT 2026
