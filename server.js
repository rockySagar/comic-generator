const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const axios = require('axios');
const OpenAI = require("openai");
const openai = new OpenAI({
   apiKey: process.env.OPEN_AI_API_KEY,
});

// Function to generate a detailed story with key scenes
async function generateDetailedStory(projectDetails,projectTitle) {
    try {
        const storyResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                // { role: "system", content: "You are a creative story writer.Create a conversational story between the characters with keys scenes,should be having the dailogs between the characters And story should not exceed six scenes" },
            
                { role: "system", content: "You are a creative story writer. Write detailed descriptions of key scenes for a comic book." },
                { role: "user", content: `Create a conversational story between the characters with key scenes And story should not exceed six scenes, based on the following project details:\n\n${projectDetails}` },
            ],
        });

        const DetailedStory = storyResponse.choices[0].message.content;
        const storyDirectory = path.join(__dirname, projectTitle);
    
        // Ensure the directory exists, if not, create it
        if (!fs.existsSync(storyDirectory)) {
            fs.mkdirSync(storyDirectory);
        }
        const sceneFilePath = path.join(storyDirectory, `story.txt`);
       
        fs.writeFileSync(sceneFilePath, DetailedStory, 'utf8');

        return DetailedStory;
    } catch (error) {
        console.error("Error generating detailed story:", error);
    }
}


// Function to create detailed comic prompts from the story
async function generateComicPromptFromStory(story,projectTitle) {
    try {
        const promptResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: "You are an image prompt creator for DALL-E 3. Provide detailed prompts for generating images and image should have explanation of each scene.  Comic book style with a vibrant colors.   " },
                { role: "user", content: `Create detailed image prompts for the following story, image should have explanation of each scene description. the location of the story is india, breaking it down into key scenes with detailed descriptions of what should appear in the image (e.g., characters, background, mood, actions, title,text and boards):\n\n${story}` },
            ],
        });

        const storyDirectory = path.join(__dirname, projectTitle);
    
        // Ensure the directory exists, if not, create it
        if (!fs.existsSync(storyDirectory)) {
            fs.mkdirSync(storyDirectory);
        }
        const sceneFilePath = path.join(storyDirectory, `prompt.json`);
        
        const storyContent = promptResponse.choices[0].message.content;
        // Save the scene as a JSON file
        fs.writeFileSync(sceneFilePath, storyContent, 'utf8');
       

        return storyContent;
    } catch (error) {
        console.error("Error generating comic prompt:", error);
    }
}



async function downloadImage(url, filename,projectTitle) {
    try {

        const imagesDirectory = path.join(__dirname, projectTitle);
        if (!fs.existsSync(imagesDirectory)) {
            fs.mkdirSync(imagesDirectory);
        }

        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
        });
        
        const imagePath = path.join(imagesDirectory, filename);
        const writer = fs.createWriteStream(imagePath);
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(imagePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading image:', error);
    }
}

async function generateComicScenes(comicPrompt, story,projectTitle) {
    const scenes = comicPrompt.split("\n\n");  // Assumes each scene description is separated by double newlines
    const sceneImages = [];
    const storyDirectory = path.join(__dirname, projectTitle);
    
    // Ensure the directory exists, if not, create it
    if (!fs.existsSync(storyDirectory)) {
        fs.mkdirSync(storyDirectory);
    }

    for (const [index, scene] of scenes.entries()) {
        try {
//             let imageStyle = `Scene Description: Image should have the explanation of the scene in text. ` + scene + `. Image should have the explanation of the scene in text
// Style: comic book style and vibrant colors.,
// language: English,
// Location: India,
// condition: Image should have the explanation of the schene in text.
// Type of Image: Single panel illustration suitable for a comic book.`;


let imageStyle = `
                Scene Description: ${scene}.
                Embed the text : "${scene}"  at the bottom of the image.
                Style: Comic book style with vibrant colors.
                Language: English.
                Location: India.
                Type of Image: Single panel illustration suitable for a comic book.
            `;
            
            // Generate the image based on the scene prompt
            const imageResponse = await openai.images.generate({
                prompt: imageStyle,
                model: "dall-e-3",
                n: 1,
                // style: "vivid",
                style: 'natural',
                size: "1024x1024", 
                // size: "512x512",  // Size can be adjusted based on your needs
            });

            const imageUrl = imageResponse.data[0].url;
            console.log("Generated Image URL for scene " + (index + 1) + ":", imageUrl);
            sceneImages.push({ sceneDescription: scene, imageUrl });

            const imageFilename = `scene_${index + 1}.jpg`;
            const localImagePath = await downloadImage(imageUrl, imageFilename,projectTitle);
            console.log(`Image saved at ${localImagePath}`);

            // Create a file for each scene (you can choose between JSON, .txt, or any other format)
            const sceneData = {
                sceneDescription: imageStyle,
                url: localImagePath,
                storyTitle: story,
                sceneNumber: index + 1
            };

           


            const sceneFilePath = path.join(storyDirectory, `scene_${index + 1}.json`);
            
            // Save the scene as a JSON file
            fs.writeFileSync(sceneFilePath, JSON.stringify(sceneData, null, 2), 'utf8');
            console.log(`Scene ${index + 1} saved to ${sceneFilePath}`);

        } catch (error) {
            console.error("Error generating image for scene:", error);
        }
    }

    return sceneImages;
}


const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main route to accept project details and generate the comic book
app.post('/create-comic-book', async (req, res) => {

    // console.log("JSON.parse(req.body)",req.body);
    const { projectDetails,title } = (req.body);

    try {
        // Step 1: Generate the story
        const story = await generateDetailedStory(projectDetails,title);

    
        console.log("Story generated");

        // Step 2: Generate comic prompts
        const comicPrompt = await generateComicPromptFromStory(story,title);

        console.log("Comic scense generated");

        // Step 3: Generate comic scenes
        const comicScenes = await generateComicScenes(comicPrompt, story,title);
        console.log("Comic images generated");

        // Return the story and scenes to the frontend
        res.json({ story, comicScenes });
    } catch (error) {
        console.error('Error creating comic book:', error);
        res.status(500).send('Error generating comic book');
    }
});

// Serve the frontend HTML (assuming it's in the 'public' directory)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

