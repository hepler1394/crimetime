const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static(__dirname));
app.use(express.json());

// Load index.html content
app.get('/load', (req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error loading file');
        } else {
            res.send(data);
        }
    });
});

// Save changes to index.html
app.post('/save', (req, res) => {
    const { content } = req.body;
    fs.writeFile(path.join(__dirname, 'index.html'), content, 'utf8', (err) => {
        if (err) {
            res.status(500).send('Error saving file');
        } else {
            res.send('File saved successfully');
        }
    });
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));
