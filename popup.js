// Wait for the DOM content to load
document.addEventListener('DOMContentLoaded', function () {
    // Retrieve stored CV file data and name from chrome.storage.local
    chrome.storage.local.get(['cvFileData', 'cvFileName'], function (result) {
        if (result.cvFileName) {
            const cvFileName = document.getElementById("cvFileName");
            cvFileName.textContent = `Selected file: ${result.cvFileName}`;
        }
    });

    // Add event listener to the file upload input
    document.getElementById("cvUpload").addEventListener("change", function () {
        if (this.files.length > 0) {
            const file = this.files[0];
            const uploadSuccessMessage = document.getElementById("uploadSuccess");
            uploadSuccessMessage.style.display = "block";

            // Display the uploaded file name
            const cvFileName = document.getElementById("cvFileName");
            cvFileName.textContent = `Selected file: ${file.name}`;

            // Store the CV file data and name in chrome.storage.local
            readFileAsArrayBuffer(file).then(arrayBuffer => {
                const cvData = Array.from(new Uint8Array(arrayBuffer)); // Convert to array for storage
                chrome.storage.local.set({ cvFileData: cvData, cvFileName: file.name });
            });

            setTimeout(() => {
                uploadSuccessMessage.style.display = "none";
            }, 3000);
        }
    });

    // Add event listener to the Generate Motivation Letter button
    document.getElementById("GenerateMotivationLetter").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const language = document.getElementById("languageSelect").value;
        const cvFileInput = document.getElementById("cvUpload");
        let cvFile = cvFileInput.files[0];
        let cvData;

        if (cvFile) {
            cvData = await readFileAsArrayBuffer(cvFile);

            // Store the CV file data and name in chrome.storage.local
            const cvArray = Array.from(new Uint8Array(cvData)); // Convert to array for storage
            chrome.storage.local.set({ cvFileData: cvArray, cvFileName: cvFile.name });
        } else {
            // Try to get CV data from storage
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['cvFileData', 'cvFileName'], function (result) {
                    resolve(result);
                });
            });
            if (result.cvFileData) {
                cvData = new Uint8Array(result.cvFileData).buffer;
                cvFile = new File([cvData], result.cvFileName, { type: "application/pdf" });
            } else {
                alert("Please upload a CV in PDF format.");
                return;
            }
        }

        // Show the loader overlay
        const loaderOverlay = document.getElementById("loaderOverlay");
        loaderOverlay.classList.add("active");

        // Execute script on the active tab to retrieve page content
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getPageContent,
        }, async (results) => {
            if (results && results[0]) {
                const pageContent = results[0].result;
                await sendContentToServer(pageContent, language, cvData, cvFile.name);

                // Hide the loader overlay after the operation is complete
                loaderOverlay.classList.remove("active");
            } else {
                // Hide the loader overlay if there's an error
                loaderOverlay.classList.remove("active");
            }
        });
    });
});

// Function to retrieve the text content of the current page
function getPageContent() {
    return document.body.innerText;
}

// Function to read a file as an ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Function to send content to the server
async function sendContentToServer(pageContent, language, cvData, cvFileName) {
    try {
        const formData = new FormData();
        formData.append("page_content", pageContent);
        formData.append("language", language);
        formData.append("cv_file", new Blob([cvData], { type: "application/pdf" }), cvFileName || "cv.pdf");

        const response = await fetch("https://cover-letter-generator-server-751858569706.europe-west9.run.app/generate_motivation_letter", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Failed to fetch the generated PDF.");
        }

        // Convert response to a blob and create a download link
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "Motivation_Letter.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        URL.revokeObjectURL(downloadUrl);

        // Display generation success message
        const generationSuccessMessage = document.getElementById("generationSuccess");
        generationSuccessMessage.style.display = "block";
        setTimeout(() => {
            generationSuccessMessage.style.display = "none";
        }, 3000);

    } catch (error) {
        console.error("Error sending content to server:", error);
        alert("An error occurred while generating the motivation letter.");
    }
}
