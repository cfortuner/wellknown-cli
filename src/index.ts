import dotenv from "dotenv";
dotenv.config();
import { Command } from "commander";
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import {
  OpenAIApi,
  Configuration,
  ChatCompletionRequestMessageRoleEnum,
} from "openai";

const apiKey = process.env.OPENAI_API_KEY || "";

const openai = new OpenAIApi(new Configuration({ apiKey }));

const program = new Command();

program.version("1.0.0").parse(process.argv);

const options = program.opts();

async function promptForAdditionalInformation(promptText: any) {
  const response = await inquirer.prompt([
    {
      type: "input",
      name: "info",
      message: promptText,
    },
  ]);

  return response.info;
}

function splitFilesIntoChunks(files: any, basePath: any, chunkSize = 2048) {
  const chunks = [];

  for (const file of files) {
    const filePath = path.join(basePath, file);
    const fileContent = fs.readFileSync(filePath, "utf8");

    const tokens = fileContent.split(/\s+/);
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunkTokens = tokens.slice(i, i + chunkSize);
      chunks.push(chunkTokens.join(" "));
    }
  }

  return chunks;
}

function readFilesFromPath(apiPath: any) {
  const fullPath = path.resolve(apiPath);
  const files = fs.readdirSync(fullPath);
  console.log("Loaded Files", files);
  return files;
}

function generateOpenAPISpec(title: any, description: any) {
  const openAPISpec = {
    openapi: "3.0.0",
    info: {
      title,
      description,
      version: "1.0.0",
    },
    paths: {},
  } as any;
  return openAPISpec;
}

function writeOpenAPISpecToFile(spec: any) {
  const specString = JSON.stringify(spec, null, 2);
  fs.writeFileSync("openapi.json", specString, "utf8");
  console.log("OpenAPI spec file generated successfully!");
}

async function main() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "path",
      message: "Please provide the path to your API code:",
      validate: (input: any) => {
        if (!input) {
          return "Path cannot be empty";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "title",
      message: "Please provide a title for your OpenAPI spec:",
    },
    {
      type: "input",
      name: "description",
      message: "Please provide a description for your OpenAPI spec:",
    },
  ]);

  console.log("Reading files...");

  // Split the files into chunks
  const files = readFilesFromPath(answers.path);
  const basePath = path.resolve(answers.path);
  const chunks = splitFilesIntoChunks(files, basePath);

  console.log("Generating OpenAPI spec...");

  // Initialize an empty OpenAPI object
  const openAPISpec = generateOpenAPISpec(answers.title, answers.description);

  console.log("Processing API code snippets...");
  // Iterate through the chunks
  for (const chunk of chunks) {
    // Extract OpenAPI details with GPT-3
    const prompt = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `Given the following API code snippet, provide important details for generating an OpenAPI specification in JSON format. The response should include 'paths' and 'components' as keys with their respective details. For example:

      {
        "paths": { "/api/v1/users": { "get": { ... } } },
        "components": { "schemas": { "User": { ... } } }
      }
      
      API code snippet:
      
      ${chunk}\n`,
    };

    console.log("\n\nProcessing chunk:\n", chunk.slice(0.1), "...\n\n");

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [prompt],
      max_tokens: 2000,
      temperature: 0.5,
    });

    console.log("GPT-3 response:", response.data.choices[0].message?.content);

    const openAPIDetails = response.data.choices[0].message?.content;

    // Process the GPT-3 response and update the openAPISpec object
    if (openAPIDetails) {
      try {
        const parsedDetails = JSON.parse(openAPIDetails);

        console.log("Parsed details:", parsedDetails);

        // Merge the parsed details into the openAPISpec object
        Object.assign(openAPISpec.paths, parsedDetails.paths);
        Object.assign(openAPISpec.components, parsedDetails.components);
      } catch (error) {
        console.error("Error processing GPT-3 response:", error);
      }
    }

    console.log("OpenAPI spec:", openAPISpec);
  }

  // Add necessary data to openAPISpec object by parsing the loaded files

  writeOpenAPISpecToFile(openAPISpec);
}

main();
