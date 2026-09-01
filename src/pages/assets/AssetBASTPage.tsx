import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assetApi } from '@/lib/api-assets';
import pepiLogo from '@/assets/peitologo.png';

export default function AssetBASTPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBAST = async () => {
      try {
        if (id) {
          const res = await assetApi.getBAST(id); // id is now bast_number or legacy id string
          setData(res);
        }
      } catch (err) {
        console.error(err);
        alert("Failed to fetch BAST data");
      } finally {
        setLoading(false);
      }
    };
    fetchBAST();
  }, [id]);

  useEffect(() => {
    if (data && !loading) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [data, loading]);

  if (loading) return <div className="p-8 text-center">Loading document...</div>;
  if (!data || data.length === 0) return <div className="p-8 text-center text-red-500">Document not found</div>;

  const printDocument = () => {
    window.print();
  };

  const headerData = data[0];

  // formatting date to dd/mm/yyyy
  const assignedDate = headerData.assigned_date ? new Date(headerData.assigned_date).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) : '-';

  const conditionMap: Record<string, string> = {
    'NEW': 'Baru',
    'USED': 'Bekas Normal',
    'GOOD': 'Bagus',
    'FAIR': 'Wajar',
    'DAMAGED': 'Rusak',
    'BROKEN': 'Hancur',
    'LOST': 'Hilang'
  };

  const isReturn = id?.startsWith('BAST-RET-');

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0 font-sans print:text-sm">
      {/* Action buttons (hidden in print) */}
      <div className="print:hidden mb-8 flex gap-4 justify-end">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
        >
          Kembali
        </button>
        <button
          onClick={printDocument}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Print BAST
        </button>
      </div>

      {/* Document Area */}
      <div className="max-w-4xl mx-auto border border-gray-200 p-12 print:border-none print:p-0 text-base print:text-sm">
        <style type="text/css" media="print">
          {`@page { size: A4; margin: 10mm; }`}
        </style>

        {/* Header Elements */}
        <div className="flex justify-between items-start mb-6 print:mb-2 relative z-0">
          <div className="w-32 opacity-20 pointer-events-none">
            <img src={pepiLogo} alt="Pepito Logo" className="w-full h-auto object-contain" />
          </div>
          <div className="border-2 border-black px-3 py-1 text-sm font-bold italic z-10">
            FM-IT-205.Rev00
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-xl font-bold text-center mb-8 print:mb-4">
            {isReturn ? "Berita Acara Pengembalian Aset IT" : "Berita Acara Serah Terima Aset IT"}
          </h2>

          <div className="space-y-4 leading-relaxed text-justify">
            <p>
              Pada tanggal : {assignedDate}, pihak IT {isReturn ? 'menerima pengembalian' : 'menyerahkan'} aset :
            </p>

            <div>
              <p className="font-bold">A. {isReturn ? 'Dari' : 'Kepada'} :</p>
              <table className="ml-4 w-full">
                <tbody>
                  <tr>
                    <td className="w-8 align-top">1.</td>
                    <td className="w-32 py-1">Nama</td>
                    <td>: {headerData.assigned_to}</td>
                  </tr>
                  <tr>
                    <td className="w-8 align-top">2.</td>
                    <td className="w-32 py-1">Departement</td>
                    <td>: {headerData.department_name || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <p className="font-bold mt-2">B. Identitas Aset :</p>
              {data.map((item, idx) => (
                <table key={item.asset_code || idx} className="w-full border-collapse border border-black mt-2 mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th colSpan={2} className="border border-black p-2 print:py-1 text-left font-bold">Identitas Aset</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black p-2 print:py-1 w-1/3">Jenis Aset</td>
                      <td className="border border-black p-2 print:py-1">{item.category_name || item.category_code}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 print:py-1">Merk/Model</td>
                      <td className="border border-black p-2 print:py-1">{item.asset_name}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 print:py-1">S/N</td>
                      <td className="border border-black p-2 print:py-1">{item.serial_number || '-'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 print:py-1">Nomer Aset</td>
                      <td className="border border-black p-2 print:py-1">{item.asset_code}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 print:py-1">Kondisi Aset</td>
                      <td className="border border-black p-2 print:py-1">{conditionMap[item.condition] || item.condition}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2 print:py-1">Kelengkapan</td>
                      <td className="border border-black p-2 print:py-1">1 unit {item.category_name || item.category_code}</td>
                    </tr>
                  </tbody>
                </table>
              ))}
              <p className="text-sm italic mb-6">
                *Note : Tabel identitas aset bisa ditambahkan sebagai lampiran bila diperlukan
              </p>
            </div>
            <div className="mt-8 border-t border-black pt-4">
              <p className="font-bold">Ketentuan :</p>
              <p className="text-sm mt-1 leading-relaxed">
                {isReturn 
                  ? "Aset telah dikembalikan kepada pihak IT. Pihak IT akan melakukan pengecekan lebih lanjut terhadap kondisi aset."
                  : "Penerima bertanggung jawab untuk menjaga, merawat dan mempergunakan aset IT untuk kepentingan perusahaan sesuai dengan ketentuan yang berlaku. Segala kerusakan atau kehilangan yang disebabkan oleh kelalaian atau tindakan yang tidak sesuai akan menjadi tanggung jawab penerima aset IT."
                }
              </p>
              <p className="mt-2">
                Demikian berita acara ini dibuat dengan sebernarnya untuk digunakan sebagaimana mestinya.
              </p>
            </div>
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-16 print:mt-8">
            <div className="text-center w-64">
              <p className="mb-24 print:mb-16">Yang {isReturn ? 'Menerima' : 'Menyerahkan'},</p>
              <p className="mb-1">(………………………)</p>
              <p className="">Admin IT</p>
            </div>
            <div className="text-center w-64">
              <p className="mb-24 print:mb-16">Yang {isReturn ? 'Menyerahkan' : 'Menerima'},</p>
              <p className="mb-1">(………………………)</p>
              <p className="">User</p>
            </div>
          </div>

          <div className="flex justify-center mt-8 print:mt-4">
            <div className="text-center w-64">
              <p className="mb-24 print:mb-16">Mengetahui,</p>
              <p className="mb-1">(…………………………)</p>
              <p className="">IT Ops Manager</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
