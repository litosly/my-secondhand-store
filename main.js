// Global state for authentication
let currentUser = null;

/**
 * Fetch items from the API and render each item as a card.
 * Image list → first image shown in gallery; click reveals the rest (simple lightbox fallback).
 */
async function init() {
    try {
        const res = await fetch('/api/items');
        const items = await res.json();
        render(items);
        setupAddItemButton();
    } catch (err) {
        console.error('Failed to load items:', err);
        document.getElementById('gallery').textContent = 'Unable to load items.';
    }
}

/**
 * Creates an Add Item button in the header
 */
function setupAddItemButton() {
    // Check if button already exists
    if (document.querySelector('.add-item-btn')) {
        document.querySelector('.add-item-btn').remove();
    }
    
    // Only show Add Item button if user is logged in
    if (currentUser) {
        const header = document.querySelector('header');
        const addButton = document.createElement('button');
        addButton.className = 'add-item-btn';
        addButton.textContent = '+ Add New Item';
        addButton.addEventListener('click', openAddItemForm);
        header.appendChild(addButton);
    }
}

function render(items) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = ''; // Clear gallery before re-rendering
    
    if (items.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-gallery';
        emptyMessage.innerHTML = '<p>No items available. Click "Add New Item" to get started!</p>';
        gallery.appendChild(emptyMessage);
        return;
    }
    
    items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'card';
        const firstImage = item.imgs[0];
        
        // Create card content
        let cardHTML = `
        <img src="${firstImage}" alt="${item.name}" loading="lazy" />
        <div class="body">
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
        `;
        
        // Add owner info if available
        if (item.owner && item.created) {
            const createdDate = new Date(item.created).toLocaleDateString();
            cardHTML += `<p class="item-meta">Added on ${createdDate}</p>`;
        }
        
        // Only show edit/delete buttons if user is logged in and has permission
        const canEdit = currentUser && (currentUser.role === 'admin' || currentUser.id === item.owner);
        
        if (canEdit) {
            cardHTML += `
            <div class="card-actions">
              <button class="edit-btn" data-id="${item.id}">Edit</button>
              <button class="delete-btn" data-id="${item.id}">Delete</button>
            </div>`;
        }
        
        cardHTML += `</div>`;
        card.innerHTML = cardHTML;
        
        // Add event listeners
        card.querySelector('img').addEventListener('click', () => openLightbox(item));
        
        if (canEdit) {
            const editBtn = card.querySelector('.edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent lightbox from opening
                    openEditForm(item);
                });
            }
            
            const deleteBtn = card.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent lightbox from opening
                    deleteItem(item.id);
                });
            }
        }
        
        gallery.appendChild(card);
    });
}

/* ultra-simple lightbox */
function openLightbox(item) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.8);
      display:flex;align-items:center;justify-content:center;z-index:9999;`;
    overlay.addEventListener('click', () => overlay.remove());

    const img = document.createElement('img');
    img.src = item.imgs[0];
    img.style.maxWidth = '90vw';
    img.style.maxHeight = '90vh';
    overlay.appendChild(img);

    document.body.appendChild(overlay);
}

/**
 * Upload an image and get its path
 */
async function uploadImage(imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to upload image');
        }
        
        const data = await response.json();
        return data.imagePath;
    } catch (err) {
        console.error('Error uploading image:', err);
        throw err;
    }
}

/**
 * Open edit form for an item
 */
function openEditForm(item) {
    // Create modal for editing
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.8);
      display:flex;align-items:center;justify-content:center;z-index:9999;`;
    
    const form = document.createElement('form');
    form.className = 'edit-form';
    form.style.cssText = `
      background:white;padding:2rem;border-radius:8px;min-width:350px;
      max-width:500px;width:90%;`;
    form.innerHTML = `
      <h2>Edit Item</h2>
      <div class="form-group">
        <label for="item-name">Name</label>
        <input type="text" id="item-name" value="${item.name}" required />
      </div>
      <div class="form-group">
        <label for="item-desc">Description</label>
        <textarea id="item-desc" required>${item.desc}</textarea>
      </div>
      <div class="form-group">
        <label for="item-image">Image</label>
        <input type="file" id="item-image" class="image-input" accept="image/*" />
        <div class="image-preview-container">
          <img src="${item.imgs[0]}" alt="Preview" class="image-preview" />
        </div>
        <div class="upload-progress" style="display:none;"></div>
        <p class="image-help">Select a new image to replace the existing one, or leave empty to keep current image</p>
      </div>
      <div class="form-actions">
        <button type="button" class="cancel-btn">Cancel</button>
        <button type="submit" class="save-btn">Save Changes</button>
      </div>
    `;
    
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    // Prevent clicks on the form from closing the overlay
    form.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close overlay when clicking outside the form
    overlay.addEventListener('click', () => {
        overlay.remove();
    });
    
    // Cancel button closes the form
    form.querySelector('.cancel-btn').addEventListener('click', () => {
        overlay.remove();
    });
    
    // Handle image preview
    const imageInput = form.querySelector('#item-image');
    const imagePreview = form.querySelector('.image-preview');
    const uploadProgress = form.querySelector('.upload-progress');
    
    imageInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
    
    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            let imagePath = item.imgs[0]; // Default to existing image
            
            // If there's a new image to upload
            if (imageInput.files && imageInput.files[0]) {
                uploadProgress.textContent = 'Uploading image...';
                uploadProgress.style.display = 'block';
                
                try {
                    imagePath = await uploadImage(imageInput.files[0]);
                    uploadProgress.textContent = 'Upload complete!';
                } catch (err) {
                    uploadProgress.textContent = 'Upload failed!';
                    throw err;
                }
            }
            
            const updatedItem = {
                name: form.querySelector('#item-name').value,
                desc: form.querySelector('#item-desc').value,
                imgs: [imagePath],
                id: item.id
            };
            
            const response = await fetch(`/api/items/${item.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedItem)
            });
            
            if (!response.ok) throw new Error('Failed to update item');
            
            // Refresh items
            init();
            overlay.remove();
        } catch (err) {
            console.error('Error updating item:', err);
            alert('Failed to update item. Please try again.');
        }
    });
}

/**
 * Open form to add a new item
 */
function openAddItemForm() {
    // Create modal for adding new item
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.8);
      display:flex;align-items:center;justify-content:center;z-index:9999;`;
    
    const form = document.createElement('form');
    form.className = 'edit-form';
    form.style.cssText = `
      background:white;padding:2rem;border-radius:8px;min-width:350px;
      max-width:500px;width:90%;`;
    form.innerHTML = `
      <h2>Add New Item</h2>
      <div class="form-group">
        <label for="item-name">Name</label>
        <input type="text" id="item-name" placeholder="Item name" required />
      </div>
      <div class="form-group">
        <label for="item-desc">Description</label>
        <textarea id="item-desc" placeholder="Item description" required></textarea>
      </div>
      <div class="form-group">
        <label for="item-image">Image</label>
        <input type="file" id="item-image" class="image-input" accept="image/*" />
        <div class="image-preview-container">
          <img src="images/webp/placeholder.webp" alt="Preview" class="image-preview" />
        </div>
        <div class="upload-progress" style="display:none;"></div>
        <p class="image-help">Select an image or use the default placeholder</p>
      </div>
      <div class="form-actions">
        <button type="button" class="cancel-btn">Cancel</button>
        <button type="submit" class="save-btn">Add Item</button>
      </div>
    `;
    
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    // Prevent clicks on the form from closing the overlay
    form.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close overlay when clicking outside the form
    overlay.addEventListener('click', () => {
        overlay.remove();
    });
    
    // Cancel button closes the form
    form.querySelector('.cancel-btn').addEventListener('click', () => {
        overlay.remove();
    });
    
    // Handle image preview
    const imageInput = form.querySelector('#item-image');
    const imagePreview = form.querySelector('.image-preview');
    const uploadProgress = form.querySelector('.upload-progress');
    
    imageInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
    
    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            let imagePath = 'images/webp/placeholder.webp'; // Default image
            
            // If there's an image to upload
            if (imageInput.files && imageInput.files[0]) {
                uploadProgress.textContent = 'Uploading image...';
                uploadProgress.style.display = 'block';
                
                try {
                    imagePath = await uploadImage(imageInput.files[0]);
                    uploadProgress.textContent = 'Upload complete!';
                } catch (err) {
                    uploadProgress.textContent = 'Upload failed!';
                    throw err;
                }
            }
            
            const newItem = {
                name: form.querySelector('#item-name').value,
                desc: form.querySelector('#item-desc').value,
                imgs: [imagePath]
            };
            
            console.log('Sending new item data:', newItem);
            
            const response = await fetch('/api/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newItem)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to create item: ${errorData.error || response.statusText}`);
            }
            
            // Refresh items
            init();
            overlay.remove();
        } catch (err) {
            console.error('Error creating item:', err);
            alert('Failed to create item. Please try again.');
        }
    });
}

/**
 * Delete an item by ID
 */
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    console.log('Deleting item with ID:', id);
    
    try {
        const response = await fetch(`/api/items/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to delete item: ${errorData.error || response.statusText}`);
        }
        
        console.log('Item deleted successfully');
        // Refresh items
        init();
    } catch (err) {
        console.error('Error deleting item:', err);
        alert('Failed to delete item. Please try again.');
    }
}

// Authentication functions
async function checkAuthStatus() {
    try {
        const res = await fetch('/api/current-user');
        if (res.ok) {
            currentUser = await res.json();
            showLoggedInUI();
        } else {
            // User is not authenticated
            currentUser = null;
            showLoginUI();
        }
    } catch (err) {
        console.error('Error checking auth status:', err);
        currentUser = null;
        showLoginUI();
    }
}

function setupAuthListeners() {
    console.log('Setting up auth listeners');
    // Get login form and ensure it exists
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        console.error('Login form not found in the DOM');
        return;
    }
    
    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Login form submitted');
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        console.log(`Attempting login for user: ${username}`);
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            console.log('Login response status:', res.status);
            
            if (res.ok) {
                const data = await res.json();
                console.log('Login successful:', data);
                currentUser = data.user;
                showLoggedInUI();
                
                // Reload items to update UI with buttons based on permissions
                init();
            } else {
                const error = await res.json();
                console.error('Login failed:', error);
                alert(`Login failed: ${error.error || 'Invalid credentials'}`);
            }
        } catch (err) {
            console.error('Login error:', err);
            alert('Login failed. Please try again.');
        }
    });
    
    // Logout button
    const logoutButton = document.getElementById('logout-button');
    if (!logoutButton) {
        console.error('Logout button not found in the DOM');
        return;
    }
    
    logoutButton.addEventListener('click', async () => {
        console.log('Logout button clicked');
        try {
            await fetch('/api/logout');
            currentUser = null;
            showLoginUI();
            
            // Reload items to update UI (hide buttons)
            init();
        } catch (err) {
            console.error('Logout error:', err);
        }
    });
}

function showLoginUI() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('user-section').style.display = 'none';
}

function showLoggedInUI() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('user-section').style.display = 'flex';
    document.getElementById('user-name').textContent = currentUser.name;
    
    const roleTag = document.getElementById('user-role');
    roleTag.textContent = currentUser.role;
    if (currentUser.role === 'admin') {
        roleTag.classList.add('admin');
    } else {
        roleTag.classList.remove('admin');
    }
}

// Initialize the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM fully loaded');
        setupAuthListeners();
        checkAuthStatus().then(() => init());
    });
} else {
    // DOM already loaded
    console.log('DOM already loaded');
    setupAuthListeners();
    checkAuthStatus().then(() => init());
}
