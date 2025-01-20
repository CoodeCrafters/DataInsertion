require('dotenv').config(); // Load environment variables from .env file

const mongoose = require('mongoose');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Load credentials from environment variables
const mongoUri = process.env.MONGO_URI;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const FILE_PATH = process.env.FILE_PATH;

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('Error connecting to MongoDB Atlas:', err));

// Create Mongoose Schema and Model for LibraryView
const libraryViewSchema = new mongoose.Schema({
  isbn: String,
  pdf_link: String,
});

const LibraryView = mongoose.model('LibraryView', libraryViewSchema);

const app = express();
app.use(cors()); // Enable CORS
app.use(bodyParser.json());

// Fetch the current JSON file from GitHub
async function fetchJSONFile() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    console.log('File fetched successfully'); // Success message
    
    return { json: JSON.parse(content), sha: response.data.sha };

  } catch (error) {
    console.error('Error fetching file:', error); // Error message if failed
    throw error; // Re-throw error for further handling
  }
}

// Update the JSON file on GitHub
async function updateJSONFile(content, sha) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const response = await axios.put(
    url,
    {
      message: 'Update JSON with new book data',
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      sha
    },
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  return response.data;
}

// Endpoint to insert a book and save PDF link in MongoDB
app.post('/insert-book', async (req, res) => {
  const { domain, book } = req.body;

  try {
    // Check if the PDF link and ISBN are provided
    if (!book.pdfLink || !book.ISBN) {
      return res.status(400).json({ message: 'PDF link and ISBN are required.' });
    }

    // Save PDF link to MongoDB (LibraryView collection)
    const libraryView = new LibraryView({
      isbn: book.ISBN,
      pdf_link: book.pdfLink, // Directly save the PDF link in the database
    });

    await libraryView.save(); // Save the PDF link to MongoDB

    console.log('PDF link saved to MongoDB successfully');

    // Now proceed with saving the book to the JSON file on GitHub
    const { json, sha } = await fetchJSONFile();

    // Check if the book already exists
    for (const entry of json) {
      if (entry.domain === domain) {
        const duplicate = entry.books.find(
          (b) => b.BookName === book.BookName || b.ISBN === book.ISBN
        );
        if (duplicate) {
          return res.status(400).json({ message: 'Book with the same name or ISBN already exists.' });
        }
      }
    }

    // Add the book to the domain (without the pdfLink, as it's already saved in MongoDB)
    let domainEntry = json.find((entry) => entry.domain === domain);
    if (!domainEntry) {
      domainEntry = { domain, books: [] };
      json.push(domainEntry);
    }
    domainEntry.books.push({
      BookName: book.BookName,
      Author: book.Author,
      ISBN: book.ISBN,
      year: book.year,
      bookCover: book.bookCover,
    });

    // Update the JSON file on GitHub
    await updateJSONFile(json, sha);

    res.json({ message: 'Book added successfully.' });
  } catch (error) {
    console.error('Error inserting book:', error);
    res.status(500).json({ message: 'Error inserting book' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
