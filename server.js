const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// In-memory data storage
let theaters = [];
let movies = [];
let ticketQueue = []; // Queue for ticket bookings

/**
 * API 1: Add a Theater with Rooms
 */
app.post('/api/theaters', (req, res) => {
  const { name, location, rooms } = req.body;

  if (!name || !location || !Array.isArray(rooms)) {
    return res.status(400).json({ message: 'Invalid input data' });
  }

  rooms.forEach((room, index) => {
    if (!room.name || !room.capacity || !Array.isArray(room.showtimes)) {
      return res.status(400).json({ message: 'Invalid room data' });
    }

    // Add seating chart for the room
    room.id = index + 1; // Unique room ID
    room.seating = Array(room.capacity.rows).fill().map(() => Array(room.capacity.columns).fill(0));
  });

  const newTheater = {
    id: theaters.length + 1,
    name,
    location,
    rooms
  };

  theaters.push(newTheater);

  res.status(201).json({
    message: 'Theater added successfully',
    theater: newTheater
  });
});

/**
 * API 2: Add a Movie to a Specific Theater Room
 */
app.post('/api/movies', (req, res) => {
  const { title, actor, actress, duration, theaterId, roomId, popularity } = req.body;

  if (!title || !actor || !actress || !duration || !theaterId || !roomId) {
    return res.status(400).json({ message: 'Invalid input data' });
  }

  const theater = theaters.find(t => t.id === theaterId);
  if (!theater) {
    return res.status(404).json({ message: 'Theater not found' });
  }

  const room = theater.rooms.find(r => r.id === roomId);
  if (!room) {
    return res.status(404).json({ message: 'Room not found in the selected theater' });
  }

  const newMovie = {
    id: movies.length + 1,
    title,
    actor,
    actress,
    duration,
    theaterId,
    roomId,
    popularity: popularity || 0,
    bookedTickets: 0 // Initialize the bookedTickets counter
  };

  movies.push(newMovie);

  res.status(201).json({
    message: 'Movie added successfully',
    movie: newMovie
  });
});

/**
 * API 3: Get All Movies with Theater and Room Info and Number of Tickets Booked
 */
app.get('/api/movies', (req, res) => {
  const { sortBy } = req.query;  // Optional query parameter to sort movies

  let enrichedMovies = movies.map(movie => {
    const theater = theaters.find(t => t.id === movie.theaterId);
    const room = theater?.rooms.find(r => r.id === movie.roomId);

    return {
      ...movie,
      theater: theater?.name || 'Unknown Theater',
      room: room?.name || 'Unknown Room',
      showtimes: room?.showtimes || [],
      bookedTickets: movie.bookedTickets // Add bookedTickets info
    };
  });

  // Sort movies by popularity if the query parameter is provided
  if (sortBy === 'popularity') {
    enrichedMovies = enrichedMovies.sort((a, b) => b.popularity - a.popularity);
  }

  res.status(200).json(enrichedMovies);
});

/**
 * API 4: Get All Theaters
 */
app.get('/api/theaters', (req, res) => {
  res.status(200).json(theaters);
});

/**
 * API 5: Book a Ticket (Using Queue)
 */
app.post('/api/book-ticket', (req, res) => {
  const { movieId, theaterId, roomId, showtime, seats } = req.body;

  if (!movieId || !theaterId || !roomId || !showtime || !Array.isArray(seats)) {
    return res.status(400).json({ message: 'Invalid input data' });
  }

  // Add booking request to the queue
  ticketQueue.push({ movieId, theaterId, roomId, showtime, seats });

  // Process the queue in order
  processQueue(res);
});

// Function to process the queue
function processQueue(response) {
  if (ticketQueue.length === 0) return;

  // Dequeue the next booking request
  const bookingRequest = ticketQueue.shift(); // Get the first booking in the queue
  const { movieId, theaterId, roomId, showtime, seats } = bookingRequest;

  const theater = theaters.find(t => t.id === theaterId);
  if (!theater) {
    return response.status(404).json({ message: 'Theater not found' });
  }

  const room = theater.rooms.find(r => r.id === roomId);
  if (!room) {
    return response.status(404).json({ message: 'Room not found in the selected theater' });
  }

  const movie = movies.find(m => m.id === movieId && m.theaterId === theaterId && m.roomId === roomId);
  if (!movie) {
    return response.status(404).json({ message: 'Movie not found in the selected theater/room' });
  }

  if (!room.showtimes.includes(showtime)) {
    return response.status(404).json({ message: 'Invalid showtime' });
  }

  const { seating } = room;
  for (const seat of seats) {
    const { row, col } = seat;

    if (row < 0 || row >= seating.length || col < 0 || col >= seating[0].length) {
      return response.status(400).json({ message: `Seat at row ${row} and col ${col} is out of bounds` });
    }

    if (seating[row][col] === 1) {
      return response.status(400).json({ message: `Seat at row ${row} and col ${col} is already booked` });
    }
  }

  seats.forEach(seat => {
    const { row, col } = seat;
    seating[row][col] = 1; // Mark as booked
  });

  movie.bookedTickets += seats.length; // Increment bookedTickets for the movie

  response.status(200).json({
    message: 'Tickets booked successfully',
    bookedSeats: seats
  });

  // Process the next booking in the queue
  setImmediate(() => processQueue(response));
};

/**
 * API 6: Get Booked Tickets for a Movie by Title
 */
app.get('/api/movies/tickets', (req, res) => {
  const { title } = req.query;

  if (!title) {
    return res.status(400).json({ message: 'Movie title is required' });
  }

  const movie = movies.find(m => m.title.toLowerCase() === title.toLowerCase());

  if (!movie) {
    return res.status(404).json({ message: 'Movie not found' });
  }

  res.status(200).json({
    title: movie.title,
    bookedTickets: movie.bookedTickets
  });
});

/**
 * API 7: Get Popular Movies
 */
app.get('/api/movies/popular', (req, res) => {
  // Sort movies by popularity in descending order
  const sortedMovies = movies.sort((a, b) => b.popularity - a.popularity);

  // Return the top popular movies
  res.status(200).json(sortedMovies);
});

/**
 * Helper function to visualize the seating arrangement
 */
function getSeatingVisualization(roomId) {
  const theater = theaters.find(t => t.rooms.some(r => r.id === roomId));
  if (!theater) return 'Theater not found';

  const room = theater.rooms.find(r => r.id === roomId);
  if (!room) return 'Room not found';

  const seating = room.seating;

  let visual = 'Seating Arrangement:\n';
  seating.forEach((row, rowIndex) => {
    visual += row.map(col => col === 0 ? 'O' : 'X').join(' ') + `  Row ${rowIndex + 1}\n`;
  });

  return visual;
}

// Example usage
console.log(getSeatingVisualization(1));  // Example: Visualize seating for room 1

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
