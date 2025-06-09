const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

async function updatePasswords() {
  try {
    // Read current users
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(data);
    
    // Define passwords
    const passwords = {
      'admin': 'admin123',
      'user1': 'password1',
      'user2': 'password2'
    };
    
    // Update passwords with new hashes
    for (const user of users) {
      if (passwords[user.username]) {
        console.log(`Updating password for ${user.username}`);
        // Generate hash with 10 rounds of salt
        user.password = await bcrypt.hash(passwords[user.username], 10);
      }
    }
    
    // Write updated users back to file
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Passwords updated successfully!');
    
    // Log the new user data for verification
    console.log('Updated users:');
    console.log(users);
  } catch (err) {
    console.error('Error updating passwords:', err);
  }
}

updatePasswords();
