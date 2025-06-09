const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const app = express();
const PORT = process.env.PORT || 3000;

const ITEMS_FILE = path.join(__dirname, 'data', 'items.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// JWT secret key (in production, use environment variables)
const JWT_SECRET = 'your-secret-key-should-be-long-and-secure';
const JWT_EXPIRY = '24h';

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, 'images/webp'));
  },
  filename: function(req, file, cb) {
    // Generate a unique filename with original extension
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueName + (ext === '.webp' ? ext : '.webp')); // Force .webp extension
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: function(req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Middleware
app.use(express.json());
app.use(express.static('.'));  // Serve static files from current directory
app.use(cookieParser());

// Helper functions for reading data files
async function readItems() {
  const data = await fs.readFile(ITEMS_FILE, 'utf8');
  return JSON.parse(data);
}

async function readUsers() {
  const data = await fs.readFile(USERS_FILE, 'utf8');
  return JSON.parse(data);
}

// Helper functions for writing data files
async function writeItems(items) {
  await fs.writeFile(ITEMS_FILE, JSON.stringify(items, null, 4));
}

async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 4));
}

// Get all items
app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const items = await readItems();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read items' });
  }
});

// Get single item by ID
app.get('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const items = await readItems();
    
    const item = items.find(item => item.id === id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve item' });
  }
});

// Image upload endpoint
app.post('/api/upload', authenticateToken, requireAuth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Return the path to the uploaded file
    const filePath = `images/webp/${req.file.filename}`;
    console.log('File uploaded successfully:', filePath);
    res.json({ imagePath: filePath });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Create a new item
app.post('/api/items', authenticateToken, requireAuth, async (req, res) => {
  try {
    console.log('POST /api/items received:', req.body);
    const newItem = req.body;
    if (!newItem.name || !newItem.desc) {
      console.log('Validation failed: missing name or description');
      return res.status(400).json({ error: 'Name and description are required' });
    }

    // Default image if none provided
    if (!newItem.imgs || !newItem.imgs.length) {
      newItem.imgs = ['images/webp/placeholder.webp'];
    }
    
    // Set owner information from authenticated user
    newItem.owner = req.user.id;
    newItem.created = new Date().toISOString();
    
    const items = await readItems();
    
    // Generate a new ID (max ID + 1)
    const maxId = items.reduce((max, item) => Math.max(max, parseInt(item.id) || 0), 0);
    newItem.id = maxId + 1;
    console.log('Generated new item with ID:', newItem.id);
    
    items.push(newItem);
    await writeItems(items);
    
    res.status(201).json(newItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update an item
app.put('/api/items/:id', authenticateToken, requireAuth, checkItemOwnership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updatedItem = req.body;
    
    const items = await readItems();
    
    const index = items.findIndex(item => parseInt(item.id) === id);
    if (index === -1) return res.status(404).json({ error: 'Item not found' });
    
    // Preserve the id and any fields not provided
    items[index] = { ...items[index], ...updatedItem };
    
    await writeItems(items);
    
    res.json(items[index]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete an item
app.delete('/api/items/:id', authenticateToken, requireAuth, checkItemOwnership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log('DELETE /api/items/:id received for ID:', id);
    
    const items = await readItems();
    console.log('Current items:', items.map(item => ({ id: item.id, name: item.name })));
    
    const index = items.findIndex(item => parseInt(item.id) === id);
    console.log('Found item at index:', index);
    
    if (index === -1) {
      console.log(`Item with ID ${id} not found`);
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Remove the item
    const deletedItem = items.splice(index, 1)[0];
    console.log('Deleted item:', deletedItem);
    await writeItems(items);
    
    res.json({ message: 'Item deleted successfully', item: deletedItem });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Authentication endpoints
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const users = await readUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    // Set cookie and send response
    res.cookie('token', token, { 
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Return user info (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, message: 'Login successful' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/current-user', authenticateToken, async (req, res) => {
  try {
    const users = await readUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Return user info (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

// Authorization middleware
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Authorization middleware to check item ownership
function checkItemOwnership(req, res, next) {
  if (req.user.role === 'admin') {
    // Admins can edit/delete any item
    return next();
  }
  
  const itemId = parseInt(req.params.id);
  readItems().then(items => {
    const item = items.find(item => parseInt(item.id) === itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (item.owner !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to modify this item' });
    }
    
    next();
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
