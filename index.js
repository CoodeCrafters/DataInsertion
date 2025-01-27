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
const FILE_PATH1 = process.env.FILE_PATH1;

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

    // Add the book to the domain without the PDF link
    let domainEntry = json.find((entry) => entry.domain === domain);
    if (!domainEntry) {
      domainEntry = { domain, books: [] };
      json.push(domainEntry);
    }

    // Add the book to the domain, without pdfLink
    const { pdfLink, ...bookWithoutPdfLink } = book; // Remove the PDF link from the book object
    domainEntry.books.push(bookWithoutPdfLink);

    // Save the PDF link in MongoDB (not in the JSON file)
    try {
      const libraryView = new LibraryView({
        isbn: book.ISBN,
        pdf_link: pdfLink,
      });

      await libraryView.save();
      console.log('PDF link saved successfully in MongoDB');
    } catch (error) {
      console.error('Error saving PDF link in MongoDB:', error);
    }

    // Update the JSON file on GitHub, without the PDF link
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

// Endpoint to fetch domain counts
app.get('/get-domain-entries', async (req, res) => {
  try {
    const { json } = await fetchJSONFile();

    if (Array.isArray(json)) {
      // Map domains to their respective counts
      const domainCounts = json.map((entry) => ({
        domain: entry.domain,
        count: entry.books.length,
      }));

      res.json(domainCounts);
    } else {
      res.status(500).json({ message: 'Invalid JSON format' });
    }
  } catch (error) {
    console.error('Error fetching domain entries:', error);
    res.status(500).json({ message: 'Error fetching domain entries' });
  }
});
 // Schema for AudioBooks
const audiobookSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  mp3Details: [
    {
      title: { type: String, required: true },
      link: { type: String, required: true },
    },
  ],
});

const Audiobook = mongoose.model('Audiobook', audiobookSchema);

// Function to fetch the audio resources JSON file from GitHub
async function fetchAudioResourcesJSON() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH1}`;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return JSON.parse(content); // Return the parsed JSON content
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed: ${error.message}`);
      if (attempts >= maxAttempts) {
        throw new Error('Max retry attempts reached. Failed to fetch audio resources.');
      }
      // Optionally add a delay before retrying (e.g., 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Endpoint to fetch audiobook suggestions based on ID
app.get('/get-suggestions', async (req, res) => {
  const { id } = req.query;

  // Check if the id query parameter is at least 2 characters long
  if (!id || id.length < 2) {
    return res.status(400).json({ message: 'ID must be at least 2 characters long' });
  }

  console.log('Received ID:', id); // Log to check if ID is correctly passed

  try {
    const audioResources = await fetchAudioResourcesJSON(); // Fetch the audio resources JSON

    // Check if the audioResources structure is valid
    if (!Array.isArray(audioResources)) {
      return res.status(500).json({ message: 'Invalid audio resources format' });
    }

    // Search through all domains and entries to find the matching ID
    const suggestions = audioResources
      .flatMap((entry) => entry.entries.map((item) => ({ ...item, domain: entry.domain }))) // Include the domain in each entry
      .filter((entry) => entry.id.includes(id)); // Match partial ID (at least 2 characters)

    if (suggestions.length > 0) {
      // Send the matching suggestions with id, title, author, and domain
      const suggestionData = suggestions.map((entry) => ({
        id: entry.id,
        title: entry.title,
        author: entry.author,
        domain: entry.domain, // Include the domain
      }));
      res.json(suggestionData); // Return the matched suggestions
    } else {
      res.status(404).json({ message: 'No suggestions found for this ID' });
    }
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ message: 'Error fetching suggestions', error: error.message });
  }
});


// Function to update the audio resources JSON file on GitHub
async function updateAudioResourcesJSON(content) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH1}`;

  // Get the current file's metadata to retrieve its SHA for updating
  const fileMetadata = await axios.get(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
  });

  const sha = fileMetadata.data.sha;

  const response = await axios.put(
    url,
    {
      message: 'Update audiobook details with new parameters',
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      sha: sha, // Include the current file's SHA
    },
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  return response.data;
}

// Endpoint to add details to an audiobook entry and save to MongoDB
app.post('/update-audiobook-details', async (req, res) => {
  const { id, totalDuration, genre, coverPhoto, year, mp3Details } = req.body;

  // Validate required fields
  if (!id || !mp3Details || !Array.isArray(mp3Details) || mp3Details.some((mp3) => !mp3.link || !mp3.title)) {
    return res.status(400).json({
      message: 'id and valid mp3Details (array with title and link) are required',
    });
  }

  try {
    // Fetch the current audio resources JSON from GitHub
    const audioResources = await fetchAudioResourcesJSON();
    let entryFound = false;

    // Update the audiobook entry in the GitHub JSON
    for (const domainEntry of audioResources) {
      const entry = domainEntry.entries.find((entry) => entry.id === id);
      if (entry) {
        entry.total_duration = totalDuration || entry.total_duration;
        entry.genre = genre || entry.genre;
        entry.bookCover_url = coverPhoto || entry.bookCover_url;
        entry.year_of_published = year || entry.year_of_published;
        entry.mp3Details = mp3Details; // Update mp3Details array
        entryFound = true;
        break;
      }
    }

    if (!entryFound) {
      return res.status(404).json({ message: 'No audiobook entry found with this ID' });
    }

    // Update GitHub JSON
    await updateAudioResourcesJSON(audioResources);

    // Save the audiobook details to MongoDB
    const existingAudiobook = await Audiobook.findOne({ id });
    if (existingAudiobook) {
      existingAudiobook.mp3Details = mp3Details; // Update the mp3Details array
      await existingAudiobook.save();
    } else {
      const newAudiobook = new Audiobook({ id, mp3Details });
      await newAudiobook.save();
    }

    res.json({ message: 'Audiobook details updated successfully.' });
  } catch (error) {
    console.error('Error updating audiobook details:', error);
    res.status(500).json({
      message: 'Error updating audiobook details',
      error: error.message,
    });
  }
});



const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
