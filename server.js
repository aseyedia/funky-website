const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the root directory and node_modules
app.use(express.static(path.join(__dirname)));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
