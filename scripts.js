
// Define the Spotify authorization endpoint, client ID, and redirect URI
const authEndpoint = 'https://accounts.spotify.com/authorize';
const clientId = "ec22011ce91f40adad38da393e3c0505";
const clientSecret = "68c0f043ed7a4644a9a40f4a0146a576";
const redirectUri = 'http://localhost:3000/success.html';
const scopes = [
 'user-read-email',
 'user-read-private',
];

// Construct the URL for the Spotify authorization page
const url = `${authEndpoint}?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes.join(' '))}&redirect_uri=${encodeURIComponent(redirectUri)}`;

// Redirect the user to the Spotify authorization page
window.location.href = url;

// Function to handle the success page
function handleSuccessPage() {
 // After successful authentication, Spotify will redirect the user to the redirect URI with an authorization code in the URL
 // You can extract this code and use it to get an access token
 const urlParams = new URLSearchParams(window.location.search);
 const authorizationCode = urlParams.get('code');

 // Use the authorization code to get an access token
 fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
  },
  body: new URLSearchParams({
    'grant_type': 'authorization_code',
    'code': authorizationCode,
    'redirect_uri': redirectUri
  })
 })
 .then(response => response.json())
 .then(data => {
   // Use the access token to get the user's profile data
   fetch('https://api.spotify.com/v1/me', {
     headers: {
       'Authorization': 'Bearer ' + data.access_token
     }
   })
   .then(response => response.json())
   .then(user => {
     // Store the user's data and send it to the Beehiiv API
     const userData = {
       name: user.display_name,
       email: user.email
     };

     // Replace this with the actual code to send the data to the Beehiiv API
     console.log(userData);
   });
 });
}

// Call the function when the success page is loaded
window.onload = handleSuccessPage;
