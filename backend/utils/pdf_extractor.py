import PyPDF2
import json
import os
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Initialize OpenAI
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
MODEL = "gpt-4-turbo-preview"

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text content from a PDF file using PyPDF2."""
    try:
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def extract_jd_metadata(content: str) -> dict:
    """Extract structured metadata from job description."""
    prompt = """
    Extract the following information from the job description in JSON format:
    {
        "job_title": "",
        "required_skills": [],
        "required_experience": "",
        "education_requirements": "",
        "job_responsibilities": [],
        "company_name": "",
        "location": "",
        "employment_type": ""
    }
    If any field is not found, leave it empty.
    Return only the JSON object, no additional text.
    """

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a precise JSON extractor. Extract information in the exact JSON format requested. Only return the JSON object, no additional text or markdown."},
                {"role": "user", "content": prompt + "\n\nJob Description:\n" + content}
            ],
            temperature=0.1,
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error extracting JD metadata: {e}")
        return {}

def extract_resume_metadata(content: str) -> dict:
    """Extract structured metadata from resume."""
    prompt = """
    Extract the following information from the resume in JSON format:
    {
        "name": "",
        "email": "",
        "phone": "",
        "education": [],
        "work_experience": [],
        "skills": [],
        "certifications": [],
        "projects": []
    }
    If any field is not found, leave it empty.
    Return only the JSON object, no additional text.
    """

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a precise JSON extractor. Extract information in the exact JSON format requested. Only return the JSON object, no additional text or markdown."},
                {"role": "user", "content": prompt + "\n\nResume:\n" + content}
            ],
            temperature=0.1,
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error extracting resume metadata: {e}")
        return {}

def process_documents(jd_path: str, resume_path: str, output_folder: str) -> tuple[dict, dict]:
    """Process both JD and resume PDFs and save their metadata."""
    # Create output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)

    # Process Job Description
    print(f"Processing job description: {jd_path}")
    jd_content = extract_text_from_pdf(jd_path)
    jd_metadata = extract_jd_metadata(jd_content)

    # Process Resume
    print(f"Processing resume: {resume_path}")
    resume_content = extract_text_from_pdf(resume_path)
    resume_metadata = extract_resume_metadata(resume_content)

    # Save metadata to JSON files
    jd_output = os.path.join(output_folder, 'job_description_metadata.json')
    resume_output = os.path.join(output_folder, 'resume_metadata.json')

    with open(jd_output, 'w') as f:
        json.dump(jd_metadata, f, indent=2)
    print(f"Saved JD metadata to {jd_output}")

    with open(resume_output, 'w') as f:
        json.dump(resume_metadata, f, indent=2)
    print(f"Saved resume metadata to {resume_output}")

    return jd_metadata, resume_metadata
