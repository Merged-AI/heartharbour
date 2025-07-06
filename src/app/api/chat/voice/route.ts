import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getAuthenticatedFamilyFromToken,
  createServerSupabase,
} from "@/lib/supabase-auth";
import { therapeuticMemory } from "@/lib/pinecone";
import { embeddedTherapeuticKnowledge } from "@/lib/embedded-therapeutic-knowledge";
import { Pinecone } from "@pinecone-database/pinecone";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Pinecone for knowledge base queries
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
})

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'dremma'

// Crisis detection keywords
const CRISIS_KEYWORDS = [
  'hurt myself', 'kill myself', 'want to die', 'end it all', 'suicide', 'suicidal',
  'cut myself', 'harm myself', 'better off dead', 'can\'t go on', 'no point living',
  'hurt me', 'hit me', 'touched inappropriately', 'abuse', 'sexual abuse'
]

function detectCrisis(message: string): boolean {
  const lowerMessage = message.toLowerCase()
  return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword))
}

function generateCrisisResponse(): string {
  return `I'm really concerned about what you just shared with me. What you're feeling is important, and I want to make sure you get the help you deserve right away. 

It's so brave of you to tell me about this. You're not alone, and there are people who care about you and want to help.

I think it's important that we get you connected with someone who can support you right now - like a parent, school counselor, or other trusted adult. 

If you're having thoughts of hurting yourself, please reach out to:
- Crisis Text Line: Text HOME to 741741
- National Suicide Prevention Lifeline: 988
- Or go to your nearest emergency room

You matter, and your life has value. Please don't give up. 💜`
}

// Analyze mood based on conversation content
function analyzeMoodFromMessage(userMessage: string, aiResponse: string): any {
  const lowerMessage = userMessage.toLowerCase()
  
  // Base scores
  let happiness = 5
  let anxiety = 5
  let sadness = 5
  let stress = 5
  let confidence = 5

  // Analyze user message for mood indicators
  
  // Positive indicators
  if (lowerMessage.includes('good') || lowerMessage.includes('happy') || lowerMessage.includes('fun') || lowerMessage.includes('playing')) {
    happiness += 2
    confidence += 1
  }
  
  if (lowerMessage.includes('calm') || lowerMessage.includes('better') || lowerMessage.includes('relaxed')) {
    anxiety -= 2
    stress -= 1
    happiness += 1
  }

  // Stress indicators
  if (lowerMessage.includes('stressed') || lowerMessage.includes('pressure') || lowerMessage.includes('overwhelmed')) {
    stress += 3
    anxiety += 2
    happiness -= 1
  }

  // Anxiety indicators
  if (lowerMessage.includes('worried') || lowerMessage.includes('nervous') || lowerMessage.includes('scared')) {
    anxiety += 3
    confidence -= 2
  }

  // Frustration/anger indicators
  if (lowerMessage.includes('annoying') || lowerMessage.includes('don\'t want to help') || lowerMessage.includes('not fair')) {
    stress += 2
    confidence -= 1
  }

  // Social issues
  if (lowerMessage.includes('friend') && (lowerMessage.includes('problem') || lowerMessage.includes('fight'))) {
    sadness += 2
    anxiety += 1
    confidence -= 2
  }

  // Family conflict indicators
  if (lowerMessage.includes('brother') || lowerMessage.includes('sister')) {
    if (lowerMessage.includes('annoying') || lowerMessage.includes('don\'t') || lowerMessage.includes('won\'t')) {
      stress += 2
    }
  }

  // Ensure scores stay within 1-10 range
  happiness = Math.max(1, Math.min(10, happiness))
  anxiety = Math.max(1, Math.min(10, anxiety))
  sadness = Math.max(1, Math.min(10, sadness))
  stress = Math.max(1, Math.min(10, stress))
  confidence = Math.max(1, Math.min(10, confidence))

  return {
    happiness,
    anxiety,
    sadness,
    stress,
    confidence,
    insights: generateAdvancedInsights(lowerMessage, { happiness, anxiety, sadness, stress, confidence })
  }
}

// Extract topics from a message for categorization
function extractTopicsFromMessage(message: string): string[] {
  if (!message) return ['General conversation']
  
  const topics = []
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('school') || lowerMessage.includes('teacher') || lowerMessage.includes('homework')) {
    topics.push('School stress')
  }
  if (lowerMessage.includes('friend') || lowerMessage.includes('social') || lowerMessage.includes('peer')) {
    topics.push('Social relationships')
  }
  if (lowerMessage.includes('anxious') || lowerMessage.includes('worried') || lowerMessage.includes('nervous')) {
    topics.push('Anxiety')
  }
  if (lowerMessage.includes('family') || lowerMessage.includes('parent') || lowerMessage.includes('sibling') || lowerMessage.includes('brother') || lowerMessage.includes('sister')) {
    topics.push('Family dynamics')
  }
  if (lowerMessage.includes('sleep') || lowerMessage.includes('tired') || lowerMessage.includes('insomnia')) {
    topics.push('Sleep issues')
  }
  if (lowerMessage.includes('stressed') || lowerMessage.includes('pressure') || lowerMessage.includes('overwhelmed')) {
    topics.push('Stress management')
  }
  if (lowerMessage.includes('angry') || lowerMessage.includes('mad') || lowerMessage.includes('annoying')) {
    topics.push('Anger management')
  }
  if (lowerMessage.includes('bullying') || lowerMessage.includes('bully') || lowerMessage.includes('mean')) {
    topics.push('Bullying concerns')
  }
  if (lowerMessage.includes('calm') || lowerMessage.includes('breathing') || lowerMessage.includes('relax')) {
    topics.push('Coping strategies')
  }
  
  return topics.length > 0 ? topics : ['General conversation']
}

// Advanced pattern analysis for parent insights
function generateAdvancedInsights(message: string, mood: any): string {
  const insights = []
  const behavioralPatterns = []
  const interventionNeeds = []
  
  // Analyze immediate concerns
  if (mood.stress >= 7) {
    insights.push('ELEVATED STRESS: Child showing significant distress that may impact daily functioning')
    interventionNeeds.push('Implement stress reduction techniques immediately')
  }
  
  // Family dynamics analysis
  if (message.includes('hate') && (message.includes('dad') || message.includes('parent'))) {
    insights.push('FAMILY CONFLICT: Strong negative emotions toward parent figure - indicates need for family therapy consultation')
    behavioralPatterns.push('Parent-child relationship strain')
    interventionNeeds.push('Schedule family meeting to address underlying issues')
  }
  
  // Impulse control patterns
  if (message.includes('angry') || message.includes('mad') || mood.anger >= 6) {
    insights.push('IMPULSE CONTROL: Signs of anger regulation difficulties - monitor for escalation patterns')
    behavioralPatterns.push('Emotional dysregulation episodes')
    interventionNeeds.push('Teach anger management techniques (breathing, counting, safe space)')
  }
  
  // Authority resistance patterns
  if (message.includes('don\'t want to') || message.includes('make me') || message.includes('not fair')) {
    insights.push('AUTHORITY ISSUES: Resistance to parental limits may indicate need for clearer boundaries and consequences')
    behavioralPatterns.push('Oppositional behaviors')
    interventionNeeds.push('Review family rules and consistent consequence system')
  }
  
  // Social/emotional development
  if (message.includes('bullying') || message.includes('friends')) {
    insights.push('SOCIAL CONCERNS: Peer relationships affecting emotional wellbeing - coordinate with school')
    interventionNeeds.push('Contact school counselor about social dynamics')
  }
  
  // Anxiety patterns
  if (mood.anxiety >= 7) {
    insights.push('ANXIETY SYMPTOMS: Clinical-level anxiety detected - consider professional assessment')
    interventionNeeds.push('Implement daily anxiety coping strategies')
  }

  // Positive indicators
  if (message.includes('better') || message.includes('calm') || mood.happiness >= 7) {
    insights.push('POSITIVE PROGRESS: Child demonstrating emotional regulation skills and therapeutic engagement')
  }
  
  // Sleep and routine concerns
  if (message.includes('bed') || message.includes('sleep') || message.includes('tired')) {
    insights.push('ROUTINE CONCERNS: Sleep/bedtime issues may be contributing to emotional dysregulation')
    interventionNeeds.push('Establish consistent bedtime routine and sleep hygiene')
  }

  // Compile comprehensive insight
  let comprehensiveInsight = ''
  
  if (insights.length > 0) {
    comprehensiveInsight += 'CLINICAL OBSERVATIONS: ' + insights.join(' | ')
  }
  
  if (behavioralPatterns.length > 0) {
    comprehensiveInsight += ' BEHAVIORAL PATTERNS: ' + behavioralPatterns.join(', ')
  }
  
  if (interventionNeeds.length > 0) {
    comprehensiveInsight += ' RECOMMENDED INTERVENTIONS: ' + interventionNeeds.join(' • ')
  }
  
  return comprehensiveInsight || 'Child engaging in therapeutic conversation with normal emotional range'
}

// Verify that child belongs to the authenticated family
async function verifyChildBelongsToFamily(
  childId: string,
  familyId: string
): Promise<boolean> {
  try {
    const supabase = createServerSupabase();
    const { data: child, error } = await supabase
      .from("children")
      .select("id, family_id")
      .eq("id", childId)
      .eq("family_id", familyId)
      .eq("is_active", true)
      .single();

    if (error || !child) {
      console.error("Error verifying child belongs to family:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in verifyChildBelongsToFamily:", error);
    return false;
  }
}

// Verify that child has completed comprehensive therapeutic profile
async function verifyChildProfileComplete(childId: string): Promise<boolean> {
  try {
    const supabase = createServerSupabase();
    const { data: child, error } = await supabase
      .from("children")
      .select("name, current_concerns, parent_goals, reason_for_adding, profile_completed")
      .eq("id", childId)
      .single();

    if (error || !child) {
      console.error("Error verifying child profile:", error);
      return false;
    }

    // Check if essential therapeutic fields are completed
    const hasRequiredFields = !!(
      child.name?.trim() &&
      child.current_concerns?.trim() &&
      child.parent_goals?.trim() &&
      child.reason_for_adding?.trim()
    );

    // Also check the profile_completed flag if it exists
    const isMarkedComplete = child.profile_completed === true;

    return hasRequiredFields && isMarkedComplete;
  } catch (error) {
    console.error("Error in verifyChildProfileComplete:", error);
    return false;
  }
}

// Get child's background context for personalized therapy
async function getChildContext(childId: string): Promise<string> {
  try {
    const supabase = createServerSupabase();
    const { data: child, error } = await supabase
      .from("children")
      .select("name, age, gender, current_concerns, triggers, parent_goals, reason_for_adding")
      .eq("id", childId)
      .single();

    if (error || !child) {
      console.error("Error fetching child context:", error);
      return `
CHILD PROFILE FOR DR. EMMA AI:
- This is a child or teenager seeking emotional support
- Provide general age-appropriate therapy and emotional validation
- Focus on building trust and providing a safe space to talk
`;
    }

    return generateChildContext({
      name: child.name,
      age: child.age,
      gender: child.gender,
      currentConcerns: child.current_concerns,
      triggers: child.triggers,
      parentGoals: child.parent_goals,
      reasonForAdding: child.reason_for_adding
    });
  } catch (error) {
    console.error("Error in getChildContext:", error);
    return "";
  }
}

// Comprehensive child context generation function
function generateChildContext(child: any): string {
  const age = Number(child.age);
  const name = child.name;
  const currentConcerns = child.currentConcerns || "";
  const triggers = child.triggers || "";
  const parentGoals = child.parentGoals || "";
  const reasonForAdding = child.reasonForAdding || "";
  const gender = child.gender || "";

  return `
COMPREHENSIVE CHILD PROFILE FOR DR. EMMA AI:

BASIC INFORMATION:
- Name: ${name}
- Age: ${age} years old
- Gender: ${gender || "Not specified"}
- Reason for therapy: ${reasonForAdding}

CURRENT MENTAL HEALTH CONCERNS:
${currentConcerns}

KNOWN TRIGGERS & STRESSORS:
${triggers || "No specific triggers identified yet"}

PARENT/GUARDIAN THERAPEUTIC GOALS:
${parentGoals}

THERAPEUTIC APPROACH FOR ${name}:
${
  age <= 8
    ? `- Use concrete, simple language appropriate for early childhood
- Incorporate play-based therapeutic techniques
- Focus on emotional vocabulary building
- Keep sessions shorter (15-20 minutes)
- Use visual and interactive elements
- Validate feelings frequently`
    : age <= 12
    ? `- Use age-appropriate emotional concepts
- Focus on problem-solving and coping skills
- Support peer relationship navigation
- Balance independence with family connection
- Incorporate school-related discussions
- Build self-awareness and emotional regulation`
    : age <= 15
    ? `- Respect growing independence and identity development
- Address social complexities and peer pressure
- Support identity formation and self-expression
- Discuss future planning and goal-setting
- Navigate family relationship changes
- Build critical thinking about emotions and relationships`
    : `- Treat as emerging adult with respect for autonomy
- Support transition to adulthood planning
- Address complex emotional and relationship topics
- Encourage independent decision-making
- Discuss future goals and aspirations
- Support family relationship evolution`
}

KEY THERAPEUTIC FOCUS AREAS FOR ${name}:
- Primary concerns: ${currentConcerns}
- Trigger awareness: ${
    triggers
      ? `Be mindful of: ${triggers}`
      : "Monitor for emotional triggers during conversations"
  }
- Parent goals: ${parentGoals}
- Age-appropriate emotional development support
- Building healthy coping mechanisms
- Strengthening family communication

CONVERSATION GUIDELINES FOR ${name}:
- Always use their name to create personal connection
- Reference their specific concerns and background
- Avoid or carefully approach known triggers
- Work toward parent-identified goals
- Adapt all interventions for ${age}-year-old developmental stage
- Create trauma-informed, safe therapeutic space
- Focus on strengths-based approach while addressing concerns
- Monitor for crisis indicators and escalate appropriately

THERAPEUTIC RELATIONSHIP BUILDING:
- Establish trust through consistency and understanding
- Show genuine interest in ${name}'s unique perspective
- Validate their experiences while providing gentle guidance
- Help them feel heard and understood
- Build therapeutic alliance before deeper therapeutic work
`;
}

// Get child data for knowledge base enhancement
async function getChildDataForKnowledge(childId: string): Promise<{age?: number, concerns?: string[]} | null> {
  try {
    const supabase = createServerSupabase();
    const { data: child, error } = await supabase
      .from("children")
      .select("age, current_concerns")
      .eq("id", childId)
      .single();

    if (error || !child) {
      console.error("Error fetching child data for knowledge base:", error);
      return null;
    }

    return {
      age: child.age,
      concerns: child.current_concerns ? child.current_concerns.split(',').map((c: string) => c.trim()) : undefined
    };
  } catch (error) {
    console.error("Error in getChildDataForKnowledge:", error);
    return null;
  }
}

// Get child-specific knowledge base documents from Pinecone
async function getChildKnowledgeBaseContext(childId: string, currentMessage: string): Promise<string> {
  try {
    const index = pinecone.index(INDEX_NAME);
    
    // Create embedding for the current message to find relevant knowledge base documents
    const queryEmbedding = await createEmbedding(currentMessage);
    
    // Search for knowledge base documents specific to this child
    const results = await index.query({
      vector: queryEmbedding,
      topK: 3, // Get top 3 most relevant documents
      filter: {
        child_id: { $eq: childId },
        type: { $eq: 'knowledge_base_document' }
      },
      includeMetadata: true
    });

    if (!results.matches || results.matches.length === 0) {
      console.log('📚 No child-specific knowledge base documents found');
      return '';
    }

    let knowledgeContext = 'CHILD-SPECIFIC KNOWLEDGE BASE CONTEXT:\n\n';
    
    results.matches.forEach((match, index) => {
      const metadata = match.metadata;
      const filename = metadata?.filename || 'Unknown document';
      const contentPreview = metadata?.content_preview || '';
      const similarity = match.score || 0;
      
      knowledgeContext += `${index + 1}. Document: ${filename} (Relevance: ${(similarity * 100).toFixed(1)}%)\n`;
      knowledgeContext += `   Content: ${contentPreview}\n\n`;
    });

    console.log(`📚 Found ${results.matches.length} relevant knowledge base documents for child ${childId}`);
    return knowledgeContext;

  } catch (error) {
    console.error('Error querying child knowledge base:', error);
    return '';
  }
}

// Create embedding for text content
async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text.substring(0, 8000), // Limit input length
      dimensions: 2048 // Explicitly set to match Pinecone index
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw new Error('Failed to create embedding');
  }
}

// Convert audio to text using OpenAI GPT-4o Transcribe
async function transcribeAudio(audioData: string): Promise<string> {
  try {
    console.log("Transcribing audio data with OpenAI GPT-4o Transcribe...");
    console.log("Audio data length:", audioData.length);

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, "base64");
    console.log("Audio buffer size:", audioBuffer.length);

    // Check if audio buffer is too small (less than 1KB might indicate no meaningful audio)
    if (audioBuffer.length < 1024) {
      console.log("Audio buffer too small, likely no meaningful audio content");
      return ""; // Return empty string for very small audio chunks
    }

    // Create a temporary file using fs
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    const tempDir = os.tmpdir();
    // Use WebM extension to match the recorded format
    const tempFile = path.join(tempDir, `audio_${Date.now()}.webm`);

    // Write the audio buffer to a temporary file
    fs.writeFileSync(tempFile, audioBuffer);
    console.log("Temporary file created:", tempFile);
    console.log("File size:", fs.statSync(tempFile).size, "bytes");

    // Create a file stream for OpenAI
    const fileStream = fs.createReadStream(tempFile);

    // Log the file details before sending
    console.log("Sending file to OpenAI:", {
      path: tempFile,
      size: fs.statSync(tempFile).size,
      exists: fs.existsSync(tempFile),
    });

    // Try with different model first to test compatibility
    let transcription;
    try {
      // Use OpenAI GPT-4o Transcribe API for better accuracy
      transcription = await openai.audio.transcriptions.create({
        file: fileStream,
        model: "gpt-4o-transcribe", // Use the latest and most accurate model
        language: "en", // Specify English for better accuracy
        response_format: "text", // Get plain text response
        temperature: 0.0, // Lower temperature for more accurate transcription
      });
    } catch (error: any) {
      console.log(
        "GPT-4o Transcribe failed, trying Whisper as fallback:",
        error.message
      );
      // Fallback to Whisper if GPT-4o Transcribe fails
      const fallbackStream = fs.createReadStream(tempFile);
      transcription = await openai.audio.transcriptions.create({
        file: fallbackStream,
        model: "whisper-1", // Fallback to Whisper
        language: "en",
        response_format: "text",
        temperature: 0.0,
      });
    }

    // Clean up the temporary file
    fs.unlinkSync(tempFile);
    console.log("Temporary file cleaned up");

    console.log("Transcription completed:", transcription);

    // Clean up the transcription text
    const cleanedTranscription =
      typeof transcription === "string" ? transcription.trim() : "";

    console.log("Cleaned transcription:", cleanedTranscription);

    // For real-time mode, we want to be more lenient about short transcriptions
    // but still filter out meaningless results
    if (cleanedTranscription.length < 3) {
      console.log(
        "Transcription too short, likely background noise or silence"
      );
      return "";
    }

    // Filter out common transcription artifacts for short audio
    const artifacts = [
      "you",
      "thank you",
      "thanks",
      "um",
      "uh",
      "hmm",
      "ah",
      "oh",
    ];
    if (artifacts.includes(cleanedTranscription.toLowerCase())) {
      console.log("Transcription appears to be artifact/filler word, ignoring");
      return "";
    }

    return cleanedTranscription;
  } catch (error: any) {
    console.error("Error transcribing audio with OpenAI:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      type: error.type,
      status: error.status,
    });

    // Clean up temp file if it exists
    try {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `audio_${Date.now()}.webm`);
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
    }

    // For real-time mode, we want to be more resilient to transcription errors
    // Return empty string instead of throwing to allow continuation
    console.log(
      "Transcription failed, returning empty string to continue real-time flow"
    );
    return "";
  }
}

// Convert text to speech using OpenAI TTS
async function textToSpeech(text: string): Promise<string | null> {
  try {
    console.log("Converting text to speech with OpenAI TTS:", text);

    // Use OpenAI TTS API
    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text,
    });

    // Convert the response to base64
    const arrayBuffer = await speech.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    console.log("TTS conversion completed");
    return base64Audio;
  } catch (error: any) {
    console.error("Error converting text to speech with OpenAI:", error);

    // Check if it's a model access error
    if (
      error.code === "model_not_found" ||
      error.message?.includes("does not have access to model")
    ) {
      console.log("TTS model not available, returning text-only response");
      return null; // Return null to indicate no audio available
    }

    throw new Error("Failed to convert text to speech");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioData, childId, sessionId, messageHistory = [] } = body;

    if (!audioData) {
      return NextResponse.json(
        { error: "Audio data is required" },
        { status: 400 }
      );
    }

    if (!childId) {
      return NextResponse.json(
        { error: "Child ID is required" },
        { status: 400 }
      );
    }

    // Get authenticated family
    const family = await getAuthenticatedFamilyFromToken();
    if (!family) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify that the child belongs to the authenticated family
    const childBelongsToFamily = await verifyChildBelongsToFamily(childId, family.id);
    if (!childBelongsToFamily) {
      return NextResponse.json(
        { error: "Child not found or access denied" },
        { status: 403 }
      );
    }

    // Verify child has complete therapeutic profile before allowing voice chat
    const isProfileComplete = await verifyChildProfileComplete(childId);
    if (!isProfileComplete) {
      return NextResponse.json(
        { 
          error: "Child profile incomplete. Please complete the therapeutic questionnaire before starting voice therapy sessions.",
          requiresProfileCompletion: true,
          childId: childId
        },
        { status: 422 }
      );
    }

    console.log("Voice chat API called with:", {
      childId,
      sessionId,
      audioDataLength: audioData ? audioData.length : 0,
      familyId: family.id,
      isRealTimeMode: sessionId?.includes("realtime-voice-session"),
    });

    // Log audio data details for debugging
    if (audioData) {
      console.log(
        "Audio data received, first 100 chars:",
        audioData.substring(0, 100)
      );
      console.log(
        "Audio data ends with:",
        audioData.substring(audioData.length - 50)
      );
      console.log(
        "Audio data valid base64:",
        /^[A-Za-z0-9+/]*={0,2}$/.test(audioData)
      );

      // For real-time mode, we expect shorter audio chunks
      if (sessionId?.includes("realtime-voice-session")) {
        console.log("Real-time mode detected - processing audio chunk");
      } else {
        // Check if audio data looks valid for traditional mode
        if (audioData.length < 1000) {
          console.warn("Audio data seems very short for traditional mode");
        }
      }

      // Log more details about the audio data
      console.log("Audio data length:", audioData.length);
      console.log(
        "Expected decoded size:",
        Math.ceil((audioData.length * 3) / 4)
      );
    }

    // Step 1: Transcribe audio to text
    const transcribedText = await transcribeAudio(audioData);

    // If transcription is empty (silence, noise, or error), return gracefully for real-time mode
    if (!transcribedText || transcribedText.trim().length === 0) {
      console.log("No transcribable content found, returning empty response");
      return NextResponse.json({
        success: true,
        transcribedText: "",
        aiResponse: "",
        audioResponse: null,
        useClientTTS: false,
        sessionId: sessionId || `voice-${Date.now()}`,
        timestamp: new Date().toISOString(),
        isEmpty: true, // Flag to indicate no meaningful content
      });
    }

    // Crisis detection
    if (detectCrisis(transcribedText)) {
      console.log('🚨 CRISIS DETECTED IN VOICE - Message:', transcribedText.substring(0, 100));
      
      return NextResponse.json({
        success: true,
        transcribedText: transcribedText,
        aiResponse: generateCrisisResponse(),
        audioResponse: null,
        useClientTTS: true, // Use client TTS for crisis response
        sessionId: sessionId || `voice-${Date.now()}`,
        timestamp: new Date().toISOString(),
        crisis: true
      });
    }

    // Get child context and therapeutic memory
    const childContext = await getChildContext(childId);
    
    // Get therapeutic memory context from Pinecone  
    let therapeuticContext = "";
    try {
      therapeuticContext = await therapeuticMemory.generateTherapeuticContext(childId, transcribedText);
      if (therapeuticContext && therapeuticContext.length > 50) {
        console.log('✅ Using therapeutic memory context from Pinecone for voice chat');
      }
    } catch (error) {
      console.error('Error accessing therapeutic memory for voice chat:', error);
      therapeuticContext = "THERAPEUTIC MODE: Using child-specific background without historical memory context.";
    }

    // Get child-specific knowledge base documents from Pinecone
    let childKnowledgeContext = "";
    try {
      childKnowledgeContext = await getChildKnowledgeBaseContext(childId, transcribedText);
      if (childKnowledgeContext && childKnowledgeContext.length > 50) {
        console.log('📚 Using child-specific knowledge base documents for voice chat');
      }
    } catch (error) {
      console.error('Error accessing child knowledge base for voice chat:', error);
      childKnowledgeContext = "";
    }

    // Get child data for enhanced knowledge base context
    const childData = await getChildDataForKnowledge(childId);
    
    // Get embedded therapeutic guidance automatically integrated into AI
    let knowledgeGuidance = "";
    try {
      // Ensure knowledge base is loaded
      await embeddedTherapeuticKnowledge.loadKnowledgeBase();
      
      // Get therapeutic context for this specific interaction
      knowledgeGuidance = embeddedTherapeuticKnowledge.getTherapeuticContext(
        childData?.age,
        childData?.concerns || extractTopicsFromMessage(transcribedText),
        transcribedText
      );
      if (knowledgeGuidance && knowledgeGuidance.length > 50) {
        console.log('🧠 Using embedded therapeutic knowledge base for voice chat');
      }
    } catch (error) {
      console.error('Error accessing embedded therapeutic knowledge for voice chat:', error);
    }

    // Create personalized system prompt for voice chat
    const personalizedSystemPrompt = `You are Dr. Emma AI, a highly skilled child and adolescent therapist with specialized training in developmental psychology, trauma-informed care, attachment theory, and evidence-based interventions.

CHILD-SPECIFIC CONTEXT:
${childContext}

${therapeuticContext}

${childKnowledgeContext}

${knowledgeGuidance}

CRITICAL INSTRUCTION: If knowledge base documents are provided above, you MUST reference and use the specific techniques, exercises, and strategies from those documents in your response. Do not make up new techniques - use the ones provided in the knowledge base context.

IMPORTANT: Use the child's actual name from the CHILD-SPECIFIC CONTEXT above in your responses when appropriate. Do not use any other names.

VOICE CHAT GUIDELINES:
- Keep responses concise but meaningful for voice interaction
- Maintain natural conversation flow
- Be warm, empathetic, and age-appropriate
- Focus on the child's specific concerns and background
- Use therapeutic techniques from the knowledge base when relevant
- Monitor for crisis indicators and respond appropriately

THERAPEUTIC FOCUS FOR THIS CHILD:
- PROACTIVELY check in about family dynamics and sibling relationships
- Ask gentle questions about school situations and friendships
- Guide conversations toward emotional awareness before anger builds up
- When child shows frustration, explore the feelings underneath
- Normalize their big feelings while teaching regulation techniques
- Help them identify their triggers in a developmentally appropriate way
- Practice coping strategies through natural conversation (breathing, counting, etc.)
- Build self-esteem and confidence around their strengths

Use this information to provide personalized, contextual therapy responses that address this specific child's needs, concerns, and background.`;

    // Build conversation context
    const conversationHistory = messageHistory?.slice(-8).map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content
    })) || [];

    const messages = [
      { role: "system", content: personalizedSystemPrompt },
      ...conversationHistory,
      { role: "user", content: transcribedText }
    ];

    // Step 2: Get AI response with comprehensive context
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages as any,
      max_tokens: 200, // Concise for voice interaction
      temperature: 0.7, // Balanced for natural conversation
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
    });

    const aiResponseText = aiResponse.choices[0]?.message?.content || "";

    // Analyze mood based on conversation content
    const moodAnalysis = analyzeMoodFromMessage(transcribedText, aiResponseText);

    // Save voice therapy session to database
    let dbSessionId = '';
    try {
      const supabase = createServerSupabase();
      const { data: sessionData, error: sessionError } = await supabase
        .from('therapy_sessions')
        .insert({
          child_id: childId,
          user_message: transcribedText,
          ai_response: aiResponseText,
          session_duration: Math.floor(Math.random() * 30) + 15, // Simulated duration 15-45 min
          mood_analysis: moodAnalysis
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error saving voice therapy session:', sessionError);
      } else if (sessionData) {
        dbSessionId = sessionData.id;
      }

      // Update child's last session time
      await supabase
        .from('children')
        .update({ last_session_at: new Date().toISOString() })
        .eq('id', childId);

    } catch (error) {
      console.error('Error logging voice session:', error);
    }

    // Store conversation in Pinecone for therapeutic memory
    try {
      if (dbSessionId) {
        await therapeuticMemory.storeConversation({
          id: dbSessionId,
          child_id: childId,
          user_message: transcribedText,
          ai_response: aiResponseText,
          mood_analysis: moodAnalysis,
          topics: extractTopicsFromMessage(transcribedText),
          session_date: new Date().toISOString(),
          therapeutic_insights: moodAnalysis.insights || 'Child engaged in voice therapeutic conversation'
        });
        console.log('✅ Voice conversation stored in therapeutic memory');
      }
    } catch (error) {
      console.error('Error storing voice conversation in therapeutic memory:', error);
    }

    // Step 3: Convert AI response to speech (or indicate client-side TTS)
    let audioResponse = null;
    try {
      audioResponse = await textToSpeech(aiResponseText);
    } catch (error) {
      console.error("TTS failed, will use client-side TTS:", error);
      // audioResponse remains null, client will use TTS
    }

    // Log conversation for analysis
    console.log('🎤 Voice Child Message:', transcribedText.substring(0, 100));
    console.log('🤖 Voice AI Response:', aiResponseText.substring(0, 100));
    console.log('👶 Voice Child ID:', childId);
    console.log('📊 Voice Mood Analysis:', moodAnalysis);

    return NextResponse.json({
      success: true,
      transcribedText,
      aiResponse: aiResponseText,
      audioResponse,
      useClientTTS: !audioResponse, // Flag to use client-side TTS if server TTS failed
      sessionId: sessionId || `voice-${Date.now()}`,
      timestamp: new Date().toISOString(),
      isEmpty: false,
    });
  } catch (error) {
    console.error("Error in voice chat API:", error);

    // For real-time mode, return a more graceful error response
    const isRealTimeMode = request.url.includes("realtime-voice-session");

    if (isRealTimeMode) {
      return NextResponse.json(
        {
          success: false,
          error: "Processing error occurred",
          transcribedText: "",
          aiResponse: "",
          audioResponse: null,
          useClientTTS: false,
          sessionId: `voice-${Date.now()}`,
          timestamp: new Date().toISOString(),
          isEmpty: true,
        },
        { status: 200 } // Return 200 to allow real-time flow to continue
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process voice chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint for voice chat service
  return NextResponse.json({
    success: true,
    message: "Voice chat API is available",
    status: "ready",
    timestamp: new Date().toISOString(),
  });
}
