// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize Express app
const app = express();

// Define __dirname and __filename for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Serve node_modules (if needed)
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// Handle all routes and serve the index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Define the port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

