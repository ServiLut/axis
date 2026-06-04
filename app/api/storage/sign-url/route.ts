import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const headersList = await headers();
        const authorization = headersList.get("authorization");
        if (!authorization) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

        const token = authorization.split(" ")[1];
        const payload = verifyToken(token);
        
        if (!payload) return NextResponse.json({ message: "Token inválido" }, { status: 401 });

        const { folder, fileType, extension, bucket } = await request.json();

        if (!folder || !fileType || !extension) {
            return NextResponse.json({ message: "Faltan parámetros" }, { status: 400 });
        }

        const bucketName = bucket || "turno";
        const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

        const { data, error } = await supabase.storage
            .from(bucketName)
            .createSignedUploadUrl(filename);

        if (error) {
            console.error("Error generating signed url:", error);
            return NextResponse.json({ message: "Error generando URL de carga" }, { status: 500 });
        }

        const { data: publicData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filename);

        return NextResponse.json({ 
            signedUrl: data.signedUrl,
            path: filename,
            publicUrl: publicData.publicUrl
        });

    } catch (error) {
        console.error("Error in sign-url:", error);
        return NextResponse.json({ message: "Error interno" }, { status: 500 });
    }
}
