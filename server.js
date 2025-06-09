const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const app = express();
const port = 3000;

// Configure multer for file uploads
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

// Helper function to read items file
async function readItems() {
  const data = await fs.readFile(path.join(__dirname, 'data/items.json'), 'utf8');
  return JSON.parse(data);
}

// Helper function to write items file
async function writeItems(items) {
  await fs.writeFile(
    path.join(__dirname, 'data/items.json'),
    JSON.stringify(items, null, 4)
  );
}

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const items = await readItems();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read items' });
  }
});

// Get single item by ID
app.get('/api/items/:id', async (req, res) => {
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
app.post('/api/upload', upload.single('image'), (req, res) => {
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
app.post('/api/items', async (req, res) => {
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
app.put('/api/items/:id', async (req, res) => {
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
app.delete('/api/items/:id', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
