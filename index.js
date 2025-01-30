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
const FILE_PATH2 = process.env.FILE_PATH2

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
module.exports = Audiobook;  // ✅ Export the model


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

/// Endpoint to add details to an audiobook entry and save to MongoDB
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

        // Save duration in GitHub JSON (but NOT in MongoDB)
        entry.mp3Details = mp3Details.map((mp3) => ({
          title: mp3.title,
          duration: mp3.duration, // Save duration in GitHub JSON
          link: mp3.link
        }));

        entryFound = true;
        break;
      }
    }

    if (!entryFound) {
      return res.status(404).json({ message: 'No audiobook entry found with this ID' });
    }

    // Update GitHub JSON
    await updateAudioResourcesJSON(audioResources);

    // Save the audiobook details to MongoDB (without duration)
    const existingAudiobook = await Audiobook.findOne({ id });
    if (existingAudiobook) {
      existingAudiobook.mp3Details = mp3Details.map((mp3) => ({
        title: mp3.title,
        link: mp3.link // Do NOT include duration in MongoDB
      }));
      await existingAudiobook.save();
    } else {
      const newAudiobook = new Audiobook({
        id,
        mp3Details: mp3Details.map((mp3) => ({
          title: mp3.title,
          link: mp3.link // Do NOT include duration in MongoDB
        }))
      });
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
app.get('/getaudiodetail', async (req, res) => {
  try {
    const { id, title } = req.query;

    // Validate required fields
    if (!id || !title) {
      return res.status(400).json({ message: "Both 'id' and 'title' are required." });
    }

    // Find audiobook entry by ID
    const audiobook = await Audiobook.findOne({ id });
    if (!audiobook) {
      return res.status(404).json({ message: 'Audiobook not found.' });
    }

    // Find matching MP3 detail by title
    const mp3Detail = audiobook.mp3Details.find(mp3 => mp3.title === title);
    if (!mp3Detail) {
      return res.status(404).json({ message: 'MP3 title not found in audiobook.' });
    }

    // Encode the link as base64
    const base64Link = Buffer.from(mp3Detail.link, 'utf-8').toString('base64');

    res.status(200).json({ link: base64Link });

  } catch (error) {
    console.error('Error fetching audio details:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// Endpoint to handle the POST request
app.post('/submitquery', async (req, res) => {
  const queryData = req.body;  // Assuming req.body contains the form data

  // Create a timestamp for the submission
  const timestamp = new Date().toISOString();
  
  // Add the timestamp to the query data
  queryData.timestamp = timestamp;

  // GitHub API URL for the file you want to update
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH2}`;

  try {
    // Step 1: Get the existing content of the file from GitHub
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
    });

    // Step 2: Decode the content (GitHub stores the file content in base64)
    const fileContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
    
    // Step 3: Parse the existing queries (or use an empty array if the file is new)
    let queries = [];
    if (fileContent) {
      queries = JSON.parse(fileContent);  // Parse existing queries if any
    }

    // Step 4: Add the new query to the list
    queries.push(queryData);

    // Step 5: Prepare the updated content
    const updatedContent = JSON.stringify(queries, null, 2);

    // Step 6: Encode the updated content to base64 for GitHub API
    const encodedContent = Buffer.from(updatedContent).toString('base64');

    // Step 7: Update the file content on GitHub via PUT request
    await axios.put(
      url,
      {
        message: 'Add new query to help & support file', // Commit message
        content: encodedContent, // Updated content in base64
        sha: response.data.sha, // SHA of the file to update
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        },
      }
    );

    // Step 8: Respond with success message
    res.status(200).json({ message: 'Query submitted successfully' });

  } catch (error) {
    console.error('Error updating file on GitHub:', error);
    res.status(500).json({ message: 'Error submitting query' });
  }
});

// Define the /heartbeat endpoint
app.get('/heartbeat', (req, res) => {
  res.status(200).send('Server is alive');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
