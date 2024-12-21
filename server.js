const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;
const cron = require('node-cron');

app.use(bodyParser.json());

let theaters = [];
let movies = [];
let ticketQueue = [];


app.post('/api/theaters', (req, res) => {
  const { name, location, rooms } = req.body;

  if (!name || !location || !Array.isArray(rooms)) {
    return res.status(400).json({ message: 'Invalid input data' });
  }

  rooms.forEach((room, index) => {
    if (!room.name || !room.capacity || !Array.isArray(room.showtimes)) {
      return res.status(400).json({ message: 'Invalid room data' });
    }

    room.id = index + 1
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
    status: 'pending', 
    bookedTickets: 0 
  };

  movies.push(newMovie);

  res.status(201).json({
    message: 'Movie added successfully',
    movie: newMovie
  });
});

app.get('/api/movies', (req, res) => {
  const { sortBy, title } = req.query;

  let filteredMovies = movies;

  if (title) {
    filteredMovies = filteredMovies.filter(movie =>
      movie.title.toLowerCase().includes(title.toLowerCase())
    );
  }

  let enrichedMovies = filteredMovies.map(movie => {
    const theater = theaters.find(t => t.id === movie.theaterId);
    const room = theater?.rooms.find(r => r.id === movie.roomId);

    return {
      title: movie.title,
      theater: theater?.name || 'Unknown Theater',
      room: room?.name || 'Unknown Room',
      showtimes: room?.showtimes || [],
      bookedTickets: movie.bookedTickets,
      status: movie.status 
    };
  });

  if (sortBy === 'popularity') {
    enrichedMovies = enrichedMovies.sort((a, b) => b.popularity - a.popularity);
  }

  res.status(200).json(enrichedMovies);
});



app.get('/api/theaters', (req, res) => {
  res.status(200).json(theaters);
});


app.post('/api/book-ticket', (req, res) => {
  const { movieId, theaterId, roomId, showtime, seats } = req.body;

  if (!movieId || !theaterId || !roomId || !showtime || !Array.isArray(seats)) {
    return res.status(400).json({ message: 'Invalid input data' });
  }


  ticketQueue.push({ movieId, theaterId, roomId, showtime, seats });


  processQueue(res);
});


function processQueue(response) {
  if (ticketQueue.length === 0) return;


  const bookingRequest = ticketQueue.shift(); 
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
    seating[row][col] = 1; 
  });

  movie.bookedTickets += seats.length; 

  response.status(200).json({
    message: 'Tickets booked successfully',
    bookedSeats: seats
  });


  setImmediate(() => processQueue(response));
};


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


app.get('/api/movies/popular', (req, res) => {

  const sortedMovies = movies.sort((a, b) => b.popularity - a.popularity);

  res.status(200).json(sortedMovies);
});

app.get('/api/theaters/:theaterId/rooms/:roomId/seating-graph', (req, res) => {
  const { theaterId, roomId } = req.params;

  const theater = theaters.find((t) => t.id === parseInt(theaterId));
  if (!theater) {
    return res.status(404).json({ message: 'Theater not found' });
  }

  const room = theater.rooms.find((r) => r.id === parseInt(roomId));
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }

  const seating = room.seating;


  const graphData = seating.map((row, rowIndex) => {
    return row.map((col, colIndex) => ({
      x: colIndex,
      y: rowIndex,
      value: col,
    }));
  });

  res.status(200).json({
    roomName: room.name,
    graphData: graphData.flat(),
  });
});
function isMovieStarted(showtime) {
  const showtimeMs = new Date(showtime).getTime();
  const currentTimeMs = Date.now();
  return currentTimeMs >= showtimeMs;
}


function isMovieDone(showtime, duration) {
  const showtimeMs = new Date(showtime).getTime();
  const durationMs = duration * 60 * 1000; 
  const currentTimeMs = Date.now();
  return currentTimeMs >= showtimeMs + durationMs;
}


cron.schedule('*/1 * * * *', () => {
  movies.forEach(movie => {
    const { showtime, duration, status } = movie;

    if (status === 'pending' && isMovieStarted(showtime)) {
      movie.status = 'started';
      console.log(`Movie "${movie.title}" has started.`);
    }

    if (status === 'started' && isMovieDone(showtime, duration)) {
      movie.status = 'done';
      console.log(`Movie "${movie.title}" has been marked as "done".`);
    }
  });
});




app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
