const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors'); // Importing CORS

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());


const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'CoodeCrafters';
const REPO_NAME = 'AsepProject';
const FILE_PATH = 'testing/resources1.json'; // Path in the repository


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

// Endpoint to fetch domains
app.get('/get-domains', async (req, res) => {
  try {
    const { json } = await fetchJSONFile();
    
    // Ensure that json is an array before proceeding
    if (Array.isArray(json)) {
      const domains = json.map(entry => entry.domain);
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
          b => b.BookName === book.BookName || b.ISBN === book.ISBN
        );
        if (duplicate) {
          return res.status(400).json({ message: 'Book with the same name or ISBN already exists.' });
        }
      }
    }

    // Add the book to the domain
    let domainEntry = json.find(entry => entry.domain === domain);
    if (!domainEntry) {
      domainEntry = { domain, books: [] };
      json.push(domainEntry);
    }
    domainEntry.books.push(book);

    // Send PDF Link to external library service
    try {
      const response = await axios.post('https://central-library.onrender.com/saveLibraryView', {
        isbn: book.ISBN,
        pdfLink: book.pdfLink
      });

      if (response.status === 200) {
        console.log('PDF link saved successfully');
      } else {
        console.error('Failed to save PDF link');
      }
    } catch (error) {
      console.error('Error saving PDF link:', error);
    }

    // Update the file
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
      const authors = json.flatMap(entry => entry.books.map(book => book.Author));
  
      // Filter authors based on the query (case-insensitive matching)
      const matchingAuthors = [...new Set(authors)].filter(author =>
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
