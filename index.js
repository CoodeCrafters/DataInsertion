require('dotenv').config(); // Load environment variables from .env file

const mongoose = require('mongoose');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');


const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const FILE_PATH = process.env.FILE_PATH;

const app = express();
app.use(cors());
app.use(bodyParser.json());


// MongoDB connection details
const mongoUri =
  'mongodb+srv://codecrafters:nn2R7uwl86Dhz5Y8@centrallibraryprofile.zw3fw.mongodb.net/CentralLibraryProfile?retryWrites=true&w=majority';

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('Error connecting to MongoDB Atlas:', err));

// MongoDB schema and model for LibraryView
const libraryViewSchema = new mongoose.Schema({
  isbn: { type: String, required: true },
  pdf_link: { type: String, required: true },
});

const LibraryView = mongoose.model('LibraryView', libraryViewSchema);

// Fetch the current JSON file from GitHub
async function fetchJSONFile() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
    });

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    console.log('File fetched successfully');
    return { json: JSON.parse(content), sha: response.data.sha };
  } catch (error) {
    console.error('Error fetching file:', error);
    throw error;
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
      sha,
    },
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  return response.data;
}

// Endpoint to fetch domains
app.get('/get-domains', async (req, res) => {
  try {
    const { json } = await fetchJSONFile();
    if (Array.isArray(json)) {
      const domains = json.map((entry) => entry.domain);
      res.json(domains);
    } else {
      res.status(500).json({ message: 'Invalid JSON format' });
    }
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ message: 'Error fetching domains' });
  }
});

// Endpoint to insert a book
app.post('/insert-book', async (req, res) => {
  const { domain, book } = req.body;

  try {
    const { json, sha } = await fetchJSONFile();

    // Check if the book already exists
    for (const entry of json) {
      if (entry.domain === domain) {
        const duplicate = entry.books.find(
          (b) => b.BookName === book.BookName || b.ISBN === book.ISBN
        );
        if (duplicate) {
          return res
            .status(400)
            .json({ message: 'Book with the same name or ISBN already exists.' });
        }
      }
    }

    // Add the book to the domain
    let domainEntry = json.find((entry) => entry.domain === domain);
    if (!domainEntry) {
      domainEntry = { domain, books: [] };
      json.push(domainEntry);
    }
    domainEntry.books.push(book);

    // Save the PDF link in MongoDB
    try {
      const libraryView = new LibraryView({
        isbn: book.ISBN,
        pdf_link: book.pdfLink,
      });

      await libraryView.save();
      console.log('PDF link saved successfully in MongoDB');
    } catch (error) {
      console.error('Error saving PDF link in MongoDB:', error);
    }

    // Update the JSON file on GitHub
    await updateJSONFile(json, sha);
    res.json({ message: 'Book added successfully.' });
  } catch (error) {
    console.error('Error inserting book:', error);
    res.status(500).json({ message: 'Error inserting book' });
  }
});

// Endpoint to search authors
app.get('/search-authors', async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  try {
    const { json } = await fetchJSONFile();

    // Collect all unique author names across all domains
    const authors = json.flatMap((entry) => entry.books.map((book) => book.Author));

    // Filter authors based on the query (case-insensitive matching)
    const matchingAuthors = [...new Set(authors)].filter((author) =>
      author.toLowerCase().includes(query.toLowerCase())
    );

    res.json(matchingAuthors);
  } catch (error) {
    console.error('Error searching authors:', error);
    res.status(500).json({ message: 'Error searching authors' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
