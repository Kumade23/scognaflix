// routes/admin.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Middleware di controllo per gli admin
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Route per la pagina admin con lista utenti
router.get('/', isAdmin, async (req, res) => {
    try {
        const users = await User.find(); // Ottieni tutti gli utenti
        res.render('admin', { users });  // Passa la lista alla vista 'admin.ejs'
    } catch (error) {
        console.error('Errore nel recupero degli utenti:', error);
        res.status(500).send('Errore nel recupero degli utenti');
    }
});

// Route per eliminare un utente specifico
router.post('/delete/:id', isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        await User.findByIdAndDelete(userId);
        res.redirect('/admin'); // Ricarica la pagina admin dopo l'eliminazione
    } catch (error) {
        console.error('Errore durante l\'eliminazione dell\'utente:', error);
        res.status(500).send('Errore durante l\'eliminazione dell\'utente');
    }
});

// Route per creare un nuovo utente
router.post('/create', isAdmin, async (req, res) => {
    const { username, password, isAdmin } = req.body;

    // Controlla se l'utente esiste già
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.send('Username già in uso');
    }

    try {
        // Crea un nuovo utente, senza fare hashing della password qui
        const newUser = new User({
            username,
            password,  // Lascia la password in chiaro, l'hashing avverrà nel middleware pre('save')
            isAdmin: isAdmin === 'on', 
        });

        await newUser.save();  // Salva l'utente nel database, il middleware `pre('save')` si occuperà dell'hashing
        res.redirect('/admin');  // Ritorna alla pagina admin con la lista aggiornata
    } catch (error) {
        console.error('Errore durante la creazione dell\'utente:', error);
        res.status(500).send('Errore durante la creazione dell\'utente');
    }
});

module.exports = router;
